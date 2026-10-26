import "server-only";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withAccess } from "@/features/access/server";
import { appendEvent } from "@/features/audit/server";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { digest } from "@/features/auth/sessions";
import { DomainError, applicationErrorCode } from "@/lib/errors";
import type { AIGateway, AIMessage } from "@/lib/ai/gateway";
import { retrieveEvidence } from "./retrieval";
import { patientChatPolicy } from "./patient-prompt";
import { aiDebug, debugMessage, debugRef, withAIDebug } from "@/lib/ai/debug";
import { practitionerDiscovery } from "./practitioner-discovery";
const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
});
const sendInput = z
  .object({
    conversationId: z.uuid(),
    requestKey: z.uuid(),
    content: z.string().min(1).max(10000),
    timezone,
  })
  .strict();
export async function createConversation(
  pool: Pool,
  session: string,
  id: string,
) {
  z.uuid().parse(id);
  return withAccess(pool, session, { kind: "patient" }, async (access) => {
    await access.tx.query(
      "insert into mhistree.conversations(id,person_id,account_id) values($1,$2,$3) on conflict do nothing",
      [id, access.actor.personId, access.actor.accountId],
    );
    const row = (
      await access.tx.query(
        "select id from mhistree.conversations where id=$1",
        [id],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    return row;
  });
}
export async function listConversations(pool: Pool, session: string) {
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) =>
      (
        await a.tx.query(
          "select id,created_at from mhistree.conversations order by created_at desc,id desc limit 30",
        )
      ).rows,
  );
}
export async function conversationHistory(
  pool: Pool,
  session: string,
  id: string,
  before?: string,
) {
  z.uuid().parse(id);
  if (before)
    z.string()
      .regex(/^\d{1,18}$/)
      .parse(before);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    if (
      !(
        await a.tx.query("select id from mhistree.conversations where id=$1", [
          id,
        ])
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const rows = (
      await a.tx.query(
        "select m.id,m.sequence::text,m.role,m.content,m.timezone,m.captured_at,m.reply_to,g.state,g.error_code from mhistree.chat_messages m left join mhistree.chat_generations g on g.message_id=m.id where m.conversation_id=$1 and ($2::bigint is null or m.sequence<$2::bigint) order by m.sequence desc limit 51",
        [id, before ?? null],
      )
    ).rows;
    const more = rows.length > 50;
    const page = rows.slice(0, 50);
    return {
      items: page.reverse(),
      nextCursor: more ? page[0].sequence : null,
    };
  });
}
export async function sendMessage(pool: Pool, session: string, input: unknown) {
  return withAIDebug({ operation: "chat.send" }, async () => {
    const result = await saveMessage(pool, session, input);
    debugMessage(result.messageId);
    aiDebug("chat.message.saved", { state: "queued" });
    return result;
  });
}
async function saveMessage(pool: Pool, session: string, input: unknown) {
  const data = sendInput.parse(input);
  await consumeAttempt(pool, "chat.send", digest(session), 30);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `chat:${data.conversationId}`,
    ]);
    if (
      !(
        await a.tx.query("select id from mhistree.conversations where id=$1", [
          data.conversationId,
        ])
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const existing = (
      await a.tx.query(
        "select * from mhistree.chat_messages where account_id=$1 and request_key=$2",
        [a.actor.accountId, data.requestKey],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.content !== data.content ||
        existing.conversation_id !== data.conversationId ||
        existing.timezone !== data.timezone
      )
        throw new DomainError("VERSION_CONFLICT");
      return { messageId: existing.id as string };
    }
    const id = randomUUID();
    await a.tx.query(
      "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,request_key) values($1,$2,$3,$4,'patient',$5,$6,$7)",
      [
        id,
        data.conversationId,
        a.actor.personId,
        a.actor.accountId,
        data.content,
        data.timezone,
        data.requestKey,
      ],
    );
    await a.tx.query(
      "insert into mhistree.chat_generations(message_id) values($1)",
      [id],
    );
    await a.tx.query(
      "insert into mhistree.extraction_jobs(account_id,message_id) values($1,$2)",
      [a.actor.accountId, id],
    );
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "chat.message.saved",
      referenceId: id,
    });
    return { messageId: id };
  });
}
export async function generateReply(
  pool: Pool,
  session: string,
  messageId: string,
  gateway: AIGateway,
  signal?: AbortSignal,
) {
  return withAIDebug(
    { operation: "chat.reply", messageRef: debugRef(messageId) },
    () => generatePatientReply(pool, session, messageId, gateway, signal),
  );
}
async function generatePatientReply(
  pool: Pool,
  session: string,
  messageId: string,
  gateway: AIGateway,
  signal?: AbortSignal,
) {
  z.uuid().parse(messageId);
  const lease = randomUUID();
  const prepared = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => {
      const message = (
        await a.tx.query(
          "select * from mhistree.chat_messages where id=$1 and role='patient'",
          [messageId],
        )
      ).rows[0];
      if (!message) throw new DomainError("ACCESS_DENIED");
      const claim = await a.tx.query(
        "update mhistree.chat_generations set state='running',attempts=attempts+1,lease_id=$2,lease_until=clock_timestamp()+interval '60 seconds',error_code=null,updated_at=clock_timestamp() where message_id=$1 and attempts<5 and (state in ('queued','failed') or (state='running' and lease_until<clock_timestamp())) returning message_id",
        [messageId, lease],
      );
      if (!claim.rowCount) return null;
      const history = (
        await a.tx.query(
          "select role,content,captured_at,timezone from mhistree.chat_messages where conversation_id=$1 and sequence<=$2 order by sequence desc limit 20",
          [message.conversation_id, message.sequence],
        )
      ).rows.reverse();
      return { message, history, personId: a.actor.personId };
    },
  );
  if (!prepared) {
    aiDebug("chat.reply.unchanged", { reason: "not-claimable" });
    return { state: "unchanged" };
  }
  aiDebug("chat.reply.claimed", { messageCount: prepared.history.length });
  try {
    const messages: AIMessage[] = prepared.history.map((m) => ({
      role: m.role === "patient" ? "user" : "assistant",
      content: `Captured ${new Date(m.captured_at).toISOString()} (${m.timezone})\n${m.content}`,
    }));
    const evidence = await retrieveEvidence(
      pool,
      session,
      { kind: "patient" },
      prepared.personId,
      prepared.message.content,
    );
    const discovery = await practitionerDiscovery(pool, session);
    const reply = await gateway.generate(
      `${patientChatPolicy}\nCurrent authorized context for grounded recall (bounded; identifiers/source lineage are internal only and must not appear in the conversational reply): ${JSON.stringify({ ...evidence, ...discovery })}`,
      messages,
      { signal },
    );
    const currentEvidence = await retrieveEvidence(
      pool,
      session,
      { kind: "patient" },
      prepared.personId,
      prepared.message.content,
    );
    const currentIds = new Set(currentEvidence.evidence.map((e) => e.id));
    if (evidence.evidence.some((e) => !currentIds.has(e.id)))
      throw new DomainError("ACCESS_REVOKED");
    if (
      discovery.status === "available" &&
      discovery.connectedPractitioners.length
    ) {
      const currentDiscovery = await practitionerDiscovery(pool, session);
      if (
        currentDiscovery.status !== "available" ||
        JSON.stringify(currentDiscovery) !== JSON.stringify(discovery)
      )
        throw new DomainError("ACCESS_REVOKED");
    }
    if (signal?.aborted) throw new DomainError("PROVIDER_UNAVAILABLE");
    const result = await withAccess(
      pool,
      session,
      { kind: "patient" },
      async (a) => {
        const done = await a.tx.query(
          "update mhistree.chat_generations set state='succeeded',lease_until=null,updated_at=clock_timestamp() where message_id=$1 and lease_id=$2 and state='running' returning message_id",
          [messageId, lease],
        );
        if (!done.rowCount) return { state: "cancelled" };
        await a.tx.query(
          "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,reply_to) values($1,$2,$3,$4,'assistant',$5,$6,$7)",
          [
            randomUUID(),
            prepared.message.conversation_id,
            a.actor.personId,
            a.actor.accountId,
            reply,
            prepared.message.timezone,
            messageId,
          ],
        );
        return { state: "succeeded" };
      },
    );
    aiDebug("chat.reply.published", {
      state: result.state,
      outputCharacters: reply.length,
    });
    return result;
  } catch (error) {
    // No generated content is published after session retirement. Expired leases permit later authorized retry.
    try {
      await withAccess(pool, session, { kind: "patient" }, (a) =>
        a.tx.query(
          "update mhistree.chat_generations set state='failed',error_code=$3,lease_until=null,updated_at=clock_timestamp() where message_id=$1 and lease_id=$2 and state='running'",
          [messageId, lease, applicationErrorCode(error)],
        ),
      );
    } catch {}
    throw error;
  }
}
export async function cancelReply(
  pool: Pool,
  session: string,
  messageId: string,
) {
  z.uuid().parse(messageId);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const result = await a.tx.query(
      "update mhistree.chat_generations set state='cancelled',lease_until=null where message_id=$1 and state in ('queued','running','failed') returning message_id",
      [messageId],
    );
    return { cancelled: Boolean(result.rowCount) };
  });
}
