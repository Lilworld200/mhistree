import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import { correctedMessageIds } from "@/features/ai-chat/memory";
import { captureMedicationCommitment } from "@/features/clinical-care/medication-recommendations";
import { sourceInput } from "@/features/health-records/schema";
import { verifiedTranscript } from "@/features/ai-chat/speech/server";
import { sharedSummary } from "@/features/ai-chat/care-action-schema";
import { authorize } from "@/features/access/server";
import { requireCare } from "@/features/appointments/server";
import { DomainError } from "@/lib/errors";
import { appendEvent } from "@/features/audit/server";
export async function sendCareMessage(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  return withAccess(pool, session, context, (a) =>
    sendCareMessageInAccess(a, input),
  );
}

/** Shares the caller transaction so reviewed chat confirmation is atomic. */
export async function sendCareMessageInAccess(
  a: AccessTransaction,
  input: unknown,
) {
  const data = z
    .object({
      connectionId: z.uuid(),
      requestKey: z.uuid(),
      content: z.string().min(1).max(10000),
      timezone: sourceInput.shape.sourceTimezone.default("unknown"),
      originConversationId: z.uuid().optional(),
      replyToMessageId: z.uuid().optional(),
      transcriptionToken: z.string().min(1).max(65536).optional(),
      summary: sharedSummary.optional(),
      recommendation: z
        .object({
          name: z.string().trim().min(1).max(200),
          details: z.string().trim().min(1).max(2000),
          reviewed: z.literal(true),
        })
        .strict()
        .optional(),
    })
    .strict()
    .parse(input);
  if (data.transcriptionToken && a.context.kind !== "patient")
    throw new DomainError("ACCESS_DENIED");
  const receipt = data.transcriptionToken
    ? await verifiedTranscript(
        data.transcriptionToken,
        a.actor.accountId,
        a.actor.sessionId,
      )
    : null;
  const transcription = receipt
    ? {
        id: receipt.id,
        text: receipt.text,
        model: receipt.model,
        capturedAt: receipt.capturedAt,
        audioSha256: receipt.audioSha256,
        durationSeconds: receipt.durationSeconds,
      }
    : null;
  if (receipt) {
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `transcript:${receipt.id}`,
    ]);
    const used = await a.tx.query(
      "select 1 from mhistree.chat_messages where transcription->>'id'=$1 union all select 1 from mhistree.care_messages where transcription->>'id'=$1 and request_key<>$2",
      [receipt.id, data.requestKey],
    );
    if (used.rowCount) throw new DomainError("VERSION_CONFLICT");
  }
  const c = await requireCare(a, data.connectionId, "messages.send");
  if (data.originConversationId || data.summary) {
    if (a.context.kind !== "patient") throw new DomainError("ACCESS_DENIED");
    const owned = await a.tx.query(
      "select id from mhistree.conversations where id=$1 and account_id=$2",
      [
        data.originConversationId ?? data.summary!.conversationId,
        a.actor.accountId,
      ],
    );
    if (!owned.rowCount) throw new DomainError("ACCESS_DENIED");
  }
  if (data.recommendation) {
    if (
      (a.context.kind !== "direct" && a.context.kind !== "organization") ||
      !data.content
        .toLowerCase()
        .includes(data.recommendation.name.toLowerCase()) ||
      !data.content.includes(data.recommendation.details) ||
      /^(para|unknown|unsure)$/i.test(data.recommendation.name)
    )
      throw new DomainError("VALIDATION_FAILED");
    await authorize(
      a,
      {
        patientPersonId: c.patient_person_id,
        originPersonId: c.patient_person_id,
        category: "prescription",
        visibility: "finalized",
        authorAccountId: a.actor.accountId,
        originalContext: a.contextId,
        originalOrganizationId:
          a.context.kind === "organization" ? a.context.organizationId : null,
      },
      "write",
    );
  }
  await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `care-message:${a.actor.accountId}:${data.requestKey}`,
  ]);
  await a.tx.query(
    "insert into mhistree.care_threads(connection_id,patient_person_id) values($1,$2) on conflict(connection_id) do nothing",
    [c.id, c.patient_person_id],
  );
  const thread = (
    await a.tx.query(
      "select id from mhistree.care_threads where connection_id=$1",
      [c.id],
    )
  ).rows[0];
  if (!thread) throw new DomainError("ACCESS_DENIED");
  // Serialize the canonical question/answer order and dependent patient reports.
  await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `care-thread:${thread.id}`,
  ]);
  if (
    data.replyToMessageId &&
    !(
      await a.tx.query(
        "select 1 from mhistree.care_messages where id=$1 and thread_id=$2",
        [data.replyToMessageId, thread.id],
      )
    ).rowCount
  )
    throw new DomainError("ACCESS_DENIED");
  const prior = (
    await a.tx.query(
      "select id,content,thread_id,summary_attachment,origin_conversation_id,transcription,timezone,reply_to from mhistree.care_messages where author_account_id=$1 and request_key=$2",
      [a.actor.accountId, data.requestKey],
    )
  ).rows[0];
  if (prior) {
    const recommendation = (
      await a.tx.query(
        "select name,details from mhistree.medication_recommendations where source_message_id=$1",
        [prior.id],
      )
    ).rows[0];
    if (
      JSON.stringify(recommendation ?? null) !==
      JSON.stringify(
        data.recommendation
          ? {
              name: data.recommendation.name,
              details: data.recommendation.details,
            }
          : null,
      )
    )
      throw new DomainError("VERSION_CONFLICT");
    if (
      (prior.transcription?.id ?? null) !== (transcription?.id ?? null) ||
      prior.content !== data.content ||
      prior.timezone !== data.timezone ||
      (prior.reply_to ?? null) !== (data.replyToMessageId ?? null) ||
      prior.thread_id !== thread.id ||
      JSON.stringify(
        prior.summary_attachment
          ? sharedSummary.parse(prior.summary_attachment)
          : null,
      ) !== JSON.stringify(data.summary ?? null) ||
      (prior.origin_conversation_id ?? null) !==
        (data.originConversationId ?? null)
    )
      throw new DomainError("VERSION_CONFLICT");
    return { id: prior.id, deliveryState: "stored" };
  }
  if (data.summary) {
    const prepared = (
      await a.tx.query(
        "select p.source_ids from mhistree.chat_handoff_preparations p join mhistree.conversations c on c.id=p.conversation_id where p.conversation_id=$1 and p.through_sequence=$2::bigint and p.source_fingerprint=$3 and c.account_id=$4",
        [
          data.summary.conversationId,
          data.summary.throughSequence,
          data.summary.sourceFingerprint,
          a.actor.accountId,
        ],
      )
    ).rows[0];
    if (!prepared || (await correctedMessageIds(a, prepared.source_ids)).size)
      throw new DomainError("VERSION_CONFLICT");
  }
  const row = (
    await a.tx.query(
      "insert into mhistree.care_messages(thread_id,author_account_id,content,request_key,summary_attachment,origin_conversation_id,input_method,transcription,timezone,reply_to) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
      [
        thread.id,
        a.actor.accountId,
        data.content,
        data.requestKey,
        data.summary ?? null,
        data.originConversationId ?? null,
        receipt ? "microphone" : "text",
        transcription,
        data.timezone,
        data.replyToMessageId ?? null,
      ],
    )
  ).rows[0];
  if (data.recommendation)
    await a.tx.query(
      "insert into mhistree.medication_recommendations(patient_person_id,author_account_id,connection_id,source_message_id,name,details) values($1,$2,$3,$4,$5,$6)",
      [
        c.patient_person_id,
        a.actor.accountId,
        c.id,
        row.id,
        data.recommendation.name,
        data.recommendation.details,
      ],
    );
  if (a.context.kind === "patient")
    await captureMedicationCommitment(a, {
      id: row.id,
      threadId: thread.id,
      source: "care",
      content: data.content,
      timezone: data.timezone,
    });
  await appendEvent(a.tx, {
    actorAccountId: a.actor.accountId,
    personId: c.patient_person_id,
    action: "care.message.saved",
    referenceId: row.id,
    contextId: a.contextId,
  });
  await a.tx.query(
    "insert into mhistree.outbox(kind,reference_id) values('care.message.saved',$1)",
    [row.id],
  );
  return { id: row.id, deliveryState: "stored" };
}
export async function careMessages(
  pool: Pool,
  session: string,
  context: ActingContext,
  connectionId: string,
  before?: string,
) {
  return withAccess(pool, session, context, (a) =>
    careMessagesInAccess(a, connectionId, before),
  );
}
export async function careMessagesInAccess(
  a: AccessTransaction,
  connectionId: string,
  before?: string,
) {
  z.uuid().parse(connectionId);
  if (before)
    z.string()
      .regex(/^\d{1,18}$/)
      .parse(before);
  await requireCare(a, connectionId, "messages.send");
  const rows = (
    await a.tx.query(
      "select m.id,m.content,m.author_account_id,m.sent_at,m.delivery_state,m.sequence::text,m.summary_attachment,m.origin_conversation_id,m.reply_to from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=$1 and ($2::bigint is null or m.sequence<$2::bigint) order by m.sequence desc limit 51",
      [connectionId, before ?? null],
    )
  ).rows;
  const more = rows.length > 50;
  const page = rows.slice(0, 50).reverse();
  const attachments = (
    await a.tx.query(
      `select ca.message_id,e.id as "eventId",e.body->>'text' text from mhistree.care_clinical_attachments ca join mhistree.contributions e on e.id=ca.event_id where ca.message_id=any($1::uuid[])`,
      [page.map((m) => m.id)],
    )
  ).rows;
  const recommendations = (
    await a.tx.query(
      "select id,source_message_id,state,name,version from mhistree.medication_recommendations where source_message_id=any($1::uuid[])",
      [page.map((m) => m.id)],
    )
  ).rows;
  const items = page.map((row) => ({
    ...row,
    own: row.author_account_id === a.actor.accountId,
    recommendations: recommendations.filter(
      (r) => r.source_message_id === row.id,
    ),
    clinical_attachments: attachments.filter(
      (attachment) => attachment.message_id === row.id,
    ),
  }));
  return { items, nextCursor: more ? items[0].sequence : null };
}
