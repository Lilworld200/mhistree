import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type AccessTransaction,
  type ActingContext,
} from "@/features/access/server";
import { careRecipientsInTransaction } from "@/features/access/patient-controls";
import { requireCare } from "@/features/appointments/server";
import { requireOwnedConversation } from "@/features/ai-chat/memory";
import {
  selectedRecipient,
  type CareRecipient,
} from "@/features/ai-chat/care-action-schema";
import { sendCareMessageInAccess } from "./server";
import { DomainError } from "@/lib/errors";

export async function touchPresence(
  a: AccessTransaction,
  connectionId: string,
) {
  await requireCare(a, connectionId, "messages.send");
  await a.tx.query(
    `insert into mhistree.care_presence(connection_id,account_id,expires_at,participant_kind) values($1,$2,clock_timestamp()+interval '45 seconds',$3) on conflict(connection_id,account_id) do update set expires_at=excluded.expires_at`,
    [
      connectionId,
      a.actor.accountId,
      a.context.kind === "patient" ? "patient" : "practitioner",
    ],
  );
  return Boolean(
    (
      await a.tx.query(
        "select 1 from mhistree.care_presence where connection_id=$1 and account_id<>$2 and participant_kind=$3 and expires_at>clock_timestamp() limit 1",
        [
          connectionId,
          a.actor.accountId,
          a.context.kind === "patient" ? "practitioner" : "patient",
        ],
      )
    ).rowCount,
  );
}
export async function practitionerPresence(
  pool: Pool,
  session: string,
  context: ActingContext,
  connectionId: string,
) {
  return withAccess(pool, session, context, async (a) => ({
    online: await touchPresence(a, z.uuid().parse(connectionId)),
  }));
}

/** The patient owns placement, with one account lock and one immutable placement per message. */
export async function connectedChat(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      action: z.enum(["sync", "send", "read"]),
      conversationId: z.uuid(),
      active: z.boolean().optional(),
      hidden: z.boolean().optional(),
      viewId: z.uuid().optional(),
      recipient: selectedRecipient.optional(),
      requestKey: z.uuid().optional(),
      replyToMessageId: z.uuid().optional(),
      timezone: z.string().max(100).optional(),
      content: z
        .string()
        .min(1)
        .max(10000)
        .refine((value) => Boolean(value.trim()))
        .optional(),
      transcriptionToken: z.string().min(1).max(65536).optional(),
      throughSequence: z
        .string()
        .regex(/^\d{1,18}$/)
        .optional(),
    })
    .strict()
    .parse(input);
  let recipients: CareRecipient[] = [];
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => {
      await requireOwnedConversation(a, d.conversationId);
      await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `care-placement:${a.actor.accountId}`,
      ]);
      if (d.active || d.action === "send")
        await a.tx.query(
          `insert into mhistree.chat_care_activity(account_id,conversation_id,view_id) values($1,$2,$3) on conflict(account_id,view_id) do update set conversation_id=excluded.conversation_id,active_at=clock_timestamp(),visible_until=clock_timestamp()+interval '45 seconds'`,
          [a.actor.accountId, d.conversationId, d.viewId ?? d.conversationId],
        );
      else
        await a.tx.query(
          "update mhistree.chat_care_activity set visible_until=case when $4::boolean then clock_timestamp() else clock_timestamp()+interval '45 seconds' end where account_id=$1 and conversation_id=$2 and view_id=$3",
          [
            a.actor.accountId,
            d.conversationId,
            d.viewId ?? d.conversationId,
            d.hidden ?? false,
          ],
        );
      if (d.hidden) return { recipients: [], online: [], items: [] };
      let messageId: string | undefined;
      if (d.action === "send" || d.action === "read") {
        const recipient = recipients.find(
          (r) =>
            r.connectionId === d.recipient?.connectionId &&
            r.practitionerId === d.recipient.practitionerId &&
            r.revision === d.recipient.connectionRevision,
        );
        if (!recipient) throw new DomainError("ACCESS_REVOKED");
        await requireCare(a, recipient.connectionId, "messages.send");
        if (d.action === "send") {
          if (!d.requestKey || !d.content)
            throw new DomainError("VALIDATION_FAILED");
          messageId = (
            await sendCareMessageInAccess(a, {
              connectionId: recipient.connectionId,
              requestKey: d.requestKey,
              content: d.content,
              originConversationId: d.conversationId,
              ...(d.replyToMessageId
                ? { replyToMessageId: d.replyToMessageId }
                : {}),
              ...(d.timezone ? { timezone: d.timezone } : {}),
              ...(d.transcriptionToken
                ? { transcriptionToken: d.transcriptionToken }
                : {}),
            })
          ).id;
          await a.tx.query(
            "insert into mhistree.chat_care_placements(message_id,account_id,conversation_id) values($1,$2,$3) on conflict do nothing",
            [messageId, a.actor.accountId, d.conversationId],
          );
        } else {
          if (!d.throughSequence) throw new DomainError("VALIDATION_FAILED");
          const displayed = (
            await a.tx.query(
              `select m.thread_id,m.sequence from mhistree.chat_care_placements p join mhistree.care_messages m on m.id=p.message_id join mhistree.care_threads t on t.id=m.thread_id where p.conversation_id=$1 and t.connection_id=$2 and m.sequence=$3::bigint`,
              [d.conversationId, recipient.connectionId, d.throughSequence],
            )
          ).rows[0];
          if (!displayed) throw new DomainError("ACCESS_DENIED");
          await a.tx.query(
            `insert into mhistree.message_read_positions(account_id,thread_id,sequence) values($1,$2,$3) on conflict(account_id,thread_id) do update set sequence=greatest(message_read_positions.sequence,excluded.sequence)`,
            [a.actor.accountId, displayed.thread_id, displayed.sequence],
          );
        }
      }
      // Only replies after an originating exchange participate; no bulk history import.
      await a.tx.query(
        `insert into mhistree.chat_care_placements(message_id,account_id,conversation_id)
      select m.id,$1,v.conversation_id from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id
      cross join lateral(select conversation_id from mhistree.chat_care_activity where account_id=$1 and visible_until>clock_timestamp() order by active_at desc,view_id desc limit 1) v
      where m.author_account_id<>$1 and exists(select 1 from mhistree.care_messages origin where origin.thread_id=m.thread_id and origin.author_account_id=$1 and origin.origin_conversation_id is not null and origin.sequence<m.sequence)
      and not exists(select 1 from mhistree.chat_care_placements p where p.message_id=m.id)
      order by m.sequence limit 100 on conflict do nothing`,
        [a.actor.accountId],
      );
      const rows = (
        await a.tx.query(
          `select m.id,m.content,m.author_account_id,m.sent_at,m.sequence::text,t.connection_id,m.summary_attachment,m.reply_to,
      coalesce(m.origin_conversation_id,(select origin.origin_conversation_id from mhistree.care_messages origin where origin.thread_id=m.thread_id and origin.origin_conversation_id is not null and origin.sequence<m.sequence order by origin.sequence desc limit 1)) origin_conversation_id
      from mhistree.chat_care_placements p join mhistree.care_messages m on m.id=p.message_id join mhistree.care_threads t on t.id=m.thread_id
      where p.conversation_id=$1 and p.account_id=$2 order by m.sequence desc limit 100`,
          [d.conversationId, a.actor.accountId],
        )
      ).rows;
      const attachments = (
        await a.tx.query(
          `select ca.message_id,e.id as "eventId",e.body->>'text' text from mhistree.care_clinical_attachments ca join mhistree.contributions e on e.id=ca.event_id where ca.message_id=any($1::uuid[])`,
          [rows.map((m) => m.id)],
        )
      ).rows;
      const online: string[] = [];
      const connectionIds = [
        ...new Set(recipients.map((r) => r.connectionId)),
      ].slice(0, 100);
      if (connectionIds.length) {
        await a.tx.query(
          `insert into mhistree.care_presence(connection_id,account_id,expires_at,participant_kind) select c.id,$2,clock_timestamp()+interval '45 seconds','patient' from mhistree.connections c where c.id=any($1::uuid[]) and mhistree.can_participate(c.id,'messages.send') on conflict(connection_id,account_id) do update set expires_at=excluded.expires_at`,
          [connectionIds, a.actor.accountId],
        );
        online.push(
          ...(
            await a.tx.query(
              "select connection_id,account_id from mhistree.care_presence where connection_id=any($1::uuid[]) and account_id<>$2 and participant_kind='practitioner' and expires_at>clock_timestamp()",
              [connectionIds, a.actor.accountId],
            )
          ).rows
            .filter((p) =>
              recipients.some(
                (r) =>
                  r.connectionId === p.connection_id &&
                  r.practitionerId === p.account_id,
              ),
            )
            .map((r) => `${r.connection_id}:${r.account_id}`),
        );
      }
      return {
        messageId,
        recipients,
        online,
        items: rows.reverse().map((m) => ({
          ...m,
          clinical_attachments: attachments.filter(
            (attachment) => attachment.message_id === m.id,
          ),
          role:
            m.author_account_id === a.actor.accountId
              ? "patient-care"
              : "practitioner",
          name:
            m.author_account_id === a.actor.accountId
              ? "You · Care message"
              : (recipients.find(
                  (r) =>
                    r.connectionId === m.connection_id &&
                    r.practitionerId === m.author_account_id,
                )?.name ?? "Care team practitioner"),
        })),
      };
    },
    async (tx, actor) => {
      recipients = (
        await careRecipientsInTransaction(tx, actor, "messages.send")
      ).connectedPractitioners;
    },
  );
}
