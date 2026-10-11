import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import {
  recordSourceInAccess,
  acceptContributionInAccess,
} from "@/features/health-records/server";
import { contributionInput } from "@/features/health-records/schema";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
export async function finalizeEntry(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  return withAccess(pool, session, context, (a) =>
    finalizeEntryInAccess(a, input),
  );
}
export async function finalizeEntryInAccess(
  a: AccessTransaction,
  input: unknown,
  resultRequestId?: string,
) {
  const context = a.context;
  const d = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      requestKey: z.uuid(),
      reviewed: z.literal(true),
      status: contributionInput.shape.status,
      correction: contributionInput.shape.correction.optional(),
      correctionKind: z.enum(["minor", "material"]).optional(),
      reason: z.string().min(10).max(1000).optional(),
    })
    .strict()
    .parse(input);
  if (context.kind !== "direct" && context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");

  const row = (
    await a.tx.query(
      "select * from mhistree.clinical_work where id=$1 for update",
      [d.id],
    )
  ).rows[0];
  if (
    !row ||
    row.original_context !== a.contextId ||
    row.kind !== "draft" ||
    row.author_account_id !== a.actor.accountId
  )
    throw new DomainError("ACCESS_DENIED");
  if (row.category === "result") {
    const request = resultRequestId
      ? (
          await a.tx.query(
            "select id from mhistree.service_requests where id=$1 and result_work_id=$2",
            [resultRequestId, row.id],
          )
        ).rows[0]
      : null;
    if (!request) throw new DomainError("ACCESS_DENIED");
  }
  if (row.state === "finalized") {
    const replay = (
      await a.tx.query(
        "select event_id from mhistree.record_operations where operation_key=$1 and actor_account_id=$2 and context_id=$3",
        [d.requestKey, a.actor.accountId, a.contextId],
      )
    ).rows[0];
    if (replay?.event_id === row.final_event_id)
      return { eventId: row.final_event_id, replayed: true };
    throw new DomainError("VERSION_CONFLICT");
  }
  if (row.version !== d.version || row.state !== "draft")
    throw new DomainError("VERSION_CONFLICT");
  if (d.correction && (!d.correctionKind || !d.reason))
    throw new DomainError("VERSION_CONFLICT");
  const source = await recordSourceInAccess(a, {
    patientPersonId: row.patient_person_id,
    category: row.category,
    visibility: "finalized",
    sourceTimezone: row.timezone,
    content: JSON.stringify({
      clinicalEntry: row.id,
      text: row.body.text,
      body: row.body,
      reviewedBy: a.actor.accountId,
      aiAssistance: row.ai_provenance,
      correctionKind: d.correctionKind ?? null,
      reason: d.reason ?? null,
    }),
    clientKey: d.requestKey,
  });
  const result = await acceptContributionInAccess(a, {
    operationKey: d.requestKey,
    sourceId: source.sourceId,
    sourceVersion: 1,
    sourceItemId: row.id,
    body: row.body,
    occurredAt: row.occurred_at,
    status: d.status,
    sourceSpans: [row.body.text],
    ...(d.correction ? { correction: d.correction } : {}),
  });
  await a.tx.query(
    "update mhistree.clinical_work set state='finalized',version=version+1,final_event_id=$2,updated_at=clock_timestamp() where id=$1",
    [row.id, result.eventId],
  );
  await a.tx.query(
    "insert into mhistree.clinical_work_versions(work_id,version,actor_account_id,body,state) values($1,$2,$3,$4,'finalized')",
    [row.id, row.version + 1, a.actor.accountId, JSON.stringify(row.body)],
  );
  await appendEvent(a.tx, {
    actorAccountId: a.actor.accountId,
    personId: row.patient_person_id,
    contextId: a.contextId,
    referenceId: result.eventId,
    action: "clinical.entry.finalized",
  });
  return result;
}
