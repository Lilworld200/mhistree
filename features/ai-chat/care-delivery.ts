import "server-only";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { withAccess, type AccessTransaction } from "@/features/access/server";
import { careRecipientsInTransaction } from "@/features/access/patient-controls";
import { sendCareMessageInAccess } from "@/features/messaging/server";
import { DomainError, applicationErrorCode } from "@/lib/errors";
import {
  careDraft,
  confirmationAnswer,
  type CareDraft,
  type CareProposal,
  type CareRecipient,
  type SelectedRecipient,
} from "./care-action-schema";

export function destinations(payload: CareDraft): SelectedRecipient[] {
  const items =
    payload.recipients ??
    (payload.connectionId &&
    payload.practitionerId &&
    payload.connectionRevision
      ? [
          {
            connectionId: payload.connectionId,
            practitionerId: payload.practitionerId,
            connectionRevision: payload.connectionRevision,
          },
        ]
      : []);
  return [...new Map(items.map((r) => [r.connectionId, r])).values()];
}
export async function decoratedProposal(
  a: AccessTransaction,
  row: CareProposal,
): Promise<CareProposal> {
  const deliveries = (
    await a.tx.query(
      'select connection_id as "connectionId",state,result_id as "resultId",error_code as "errorCode" from mhistree.chat_care_deliveries where proposal_id=$1 order by connection_id',
      [row.id],
    )
  ).rows;
  const confirmation =
    (
      await a.tx.query(
        "select id,question,proposal_version as version from mhistree.chat_care_confirmations where proposal_id=$1 and proposal_version=$2 and consumed_by is null and expires_at>clock_timestamp()",
        [row.id, row.version],
      )
    ).rows[0] ?? null;
  return {
    id: row.id,
    kind: row.kind,
    payload: careDraft.parse(row.payload),
    state: row.state,
    version: row.version,
    result_id: row.result_id,
    deliveries,
    confirmation,
  };
}
export async function invalidateCareConfirmation(
  a: AccessTransaction,
  conversationId: string,
) {
  await a.tx.query(
    "delete from mhistree.chat_care_confirmations where conversation_id=$1",
    [conversationId],
  );
}
export async function armCareConfirmation(
  pool: Pool,
  session: string,
  id: string,
  version: number,
) {
  let recipients: CareRecipient[] = [];
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => {
      const row = (
        await a.tx.query(
          "select p.*,m.conversation_id from mhistree.chat_care_proposals p join mhistree.chat_messages m on m.id=p.reply_message_id where p.id=$1 for update of p",
          [id],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      if (
        row.version !== version ||
        row.kind !== "message" ||
        !["draft", "partial", "failed"].includes(row.state)
      )
        throw new DomainError("VERSION_CONFLICT");
      const payload = careDraft.parse(row.payload);
      const selected = payload.recipients ?? destinations(payload);
      if (!selected.length || !row.payload.content.trim())
        throw new DomainError("VALIDATION_FAILED");
      const eligible = selected.filter((s) =>
        recipients.some(
          (r) =>
            r.connectionId === s.connectionId &&
            r.practitionerId === s.practitionerId &&
            r.revision === s.connectionRevision,
        ),
      );
      if (!eligible.length) throw new DomainError("ACCESS_REVOKED");
      const names = selected.map(
        (s) =>
          recipients.find(
            (r) =>
              r.connectionId === s.connectionId &&
              r.practitionerId === s.practitionerId,
          )?.name ?? "a previously selected care team",
      );
      const question = `Send this message to ${names.join(", ")}?`;
      const anchor = (
        await a.tx.query(
          "select id from mhistree.chat_messages where conversation_id=$1 order by sequence desc limit 1",
          [row.conversation_id],
        )
      ).rows[0];
      if (anchor?.id !== row.reply_message_id)
        throw new DomainError("VERSION_CONFLICT");
      await a.tx.query(
        `insert into mhistree.chat_care_confirmations(conversation_id,id,proposal_id,proposal_version,anchor_message_id,question) values($1,$2,$3,$4,$5,$6)
      on conflict(conversation_id) do update set id=excluded.id,proposal_id=excluded.proposal_id,proposal_version=excluded.proposal_version,anchor_message_id=excluded.anchor_message_id,question=excluded.question,expires_at=clock_timestamp()+interval '10 minutes',consumed_by=null`,
        [row.conversation_id, randomUUID(), id, version, anchor.id, question],
      );
      return decoratedProposal(a, row);
    },
    async (tx, actor) => {
      recipients = (
        await careRecipientsInTransaction(tx, actor, "messages.send")
      ).connectedPractitioners;
    },
  );
}

/** One short transaction per destination. Never replay successful copies. */
export async function confirmCareMessages(
  pool: Pool,
  session: string,
  id: string,
  version: number,
): Promise<CareProposal | null> {
  const prepared = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => {
      const row = (
        await a.tx.query(
          "select * from mhistree.chat_care_proposals where id=$1 for update",
          [id],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      if (row.kind !== "message") return null;
      if (
        row.state === "completed" &&
        [row.version, row.version - 1].includes(version)
      )
        return { done: await decoratedProposal(a, row) };
      if (
        row.version !== version ||
        !["draft", "partial", "failed", "sending"].includes(row.state)
      )
        throw new DomainError("VERSION_CONFLICT");
      const payload = careDraft.parse(row.payload),
        targets = destinations(payload);
      if (!targets.length) throw new DomainError("ACCESS_DENIED");
      if (!payload.content.trim()) throw new DomainError("VALIDATION_FAILED");
      for (const target of targets) {
        const old = (
          await a.tx.query(
            "select reviewed_content from mhistree.chat_care_deliveries where proposal_id=$1 and connection_id=$2",
            [id, target.connectionId],
          )
        ).rows[0];
        if (old && old.reviewed_content !== payload.content)
          throw new DomainError("VERSION_CONFLICT");
        await a.tx.query(
          "insert into mhistree.chat_care_deliveries(proposal_id,connection_id,reviewed_content) values($1,$2,$3) on conflict do nothing",
          [id, target.connectionId, payload.content],
        );
      }
      await a.tx.query(
        "update mhistree.chat_care_proposals set state='sending',updated_at=clock_timestamp() where id=$1",
        [id],
      );
      return { payload, targets };
    },
  );
  if (!prepared) return null;
  if ("done" in prepared) return prepared.done ?? null;
  for (const target of prepared.targets) {
    try {
      let recipients: CareRecipient[] = [];
      await withAccess(
        pool,
        session,
        { kind: "patient" },
        async (a) => {
          const parent = (
            await a.tx.query(
              "select version,state from mhistree.chat_care_proposals where id=$1 for update",
              [id],
            )
          ).rows[0];
          const child = (
            await a.tx.query(
              "select * from mhistree.chat_care_deliveries where proposal_id=$1 and connection_id=$2 for update",
              [id, target.connectionId],
            )
          ).rows[0];
          if (child.state === "stored") return;
          if (parent.version !== version || parent.state !== "sending")
            throw new DomainError("VERSION_CONFLICT");
          const alternatives = (
            prepared.payload.recipients ?? prepared.targets
          ).filter((s) => s.connectionId === target.connectionId);
          if (
            !recipients.some((r) =>
              alternatives.some(
                (s) =>
                  r.connectionId === s.connectionId &&
                  r.practitionerId === s.practitionerId &&
                  r.revision === s.connectionRevision,
              ),
            )
          )
            throw new DomainError("ACCESS_REVOKED");
          const result = await sendCareMessageInAccess(a, {
            connectionId: target.connectionId,
            requestKey: child.operation_key,
            content: child.reviewed_content,
          });
          await a.tx.query(
            "update mhistree.chat_care_deliveries set state='stored',result_id=$3,error_code=null,updated_at=clock_timestamp() where proposal_id=$1 and connection_id=$2",
            [id, target.connectionId, result.id],
          );
        },
        async (tx, actor) => {
          recipients = (
            await careRecipientsInTransaction(tx, actor, "messages.send")
          ).connectedPractitioners;
        },
      );
    } catch (error) {
      const code = applicationErrorCode(error);
      if (["AUTH_REQUIRED", "SESSION_RETIRED"].includes(code)) throw error;
      await withAccess(pool, session, { kind: "patient" }, async (a) => {
        await a.tx.query(
          "update mhistree.chat_care_deliveries set state='failed',error_code=$3,updated_at=clock_timestamp() where proposal_id=$1 and connection_id=$2 and state<>'stored'",
          [id, target.connectionId, code],
        );
      });
    }
  }
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const row = (
      await a.tx.query(
        "select * from mhistree.chat_care_proposals where id=$1 for update",
        [id],
      )
    ).rows[0];
    const results = (
      await a.tx.query(
        "select state,result_id from mhistree.chat_care_deliveries where proposal_id=$1",
        [id],
      )
    ).rows;
    if (row.version === version && row.state === "sending") {
      const stored = results.filter((r) => r.state === "stored");
      const state =
        stored.length === results.length
          ? "completed"
          : stored.length
            ? "partial"
            : "failed";
      await a.tx.query(
        "update mhistree.chat_care_proposals set state=$2,result_id=$3,version=version+1,updated_at=clock_timestamp() where id=$1",
        [id, state, stored[0]?.result_id ?? null],
      );
      row.state = state;
      row.result_id = stored[0]?.result_id ?? null;
      row.version++;
      await a.tx.query(
        "delete from mhistree.chat_care_confirmations where proposal_id=$1 and consumed_by is null",
        [id],
      );
    }
    return decoratedProposal(a, row);
  });
}

/** Claim only the next standalone answer to the exact latest reviewed Send question. */
export async function claimTypedCareConfirmation(
  pool: Pool,
  session: string,
  messageId: string,
) {
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const message = (
      await a.tx.query(
        "select * from mhistree.chat_messages where id=$1 and role='patient'",
        [messageId],
      )
    ).rows[0];
    if (!message) throw new DomainError("ACCESS_DENIED");
    const confirmation = (
      await a.tx.query(
        "select * from mhistree.chat_care_confirmations where conversation_id=$1 and (expires_at>clock_timestamp() or consumed_by=$2) for update",
        [message.conversation_id, messageId],
      )
    ).rows[0];
    if (!confirmation) return null;
    if (message.care_confirmation_id !== confirmation.id) {
      if (!confirmation.consumed_by)
        await invalidateCareConfirmation(a, message.conversation_id);
      return null;
    }
    if (confirmation.consumed_by && confirmation.consumed_by !== messageId)
      return null;
    const proposal = (
      await a.tx.query(
        "select version,state from mhistree.chat_care_proposals where id=$1",
        [confirmation.proposal_id],
      )
    ).rows[0];
    if (
      confirmation.consumed_by === messageId &&
      ["completed", "partial", "failed"].includes(proposal?.state)
    )
      return {
        answer: confirmationAnswer(message.content)!,
        proposalId: confirmation.proposal_id,
        version: proposal.version,
        replay: true,
      };
    const previous = (
      await a.tx.query(
        "select id from mhistree.chat_messages where conversation_id=$1 and sequence<$2 order by sequence desc limit 1",
        [message.conversation_id, message.sequence],
      )
    ).rows[0];
    const answer = confirmationAnswer(message.content);
    if (
      !answer ||
      proposal?.version !== confirmation.proposal_version ||
      previous?.id !== confirmation.anchor_message_id
    ) {
      if (!confirmation.consumed_by)
        await invalidateCareConfirmation(a, message.conversation_id);
      return null;
    }
    await a.tx.query(
      "update mhistree.chat_care_confirmations set consumed_by=$2 where conversation_id=$1",
      [message.conversation_id, messageId],
    );
    if (answer === "no") {
      return {
        answer,
        proposalId: confirmation.proposal_id,
        version: confirmation.proposal_version,
      };
    }
    return {
      answer,
      proposalId: confirmation.proposal_id,
      version: confirmation.proposal_version,
    };
  });
}
