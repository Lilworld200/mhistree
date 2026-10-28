import "server-only";
import { appendEvent } from "@/features/audit/server";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  authorize,
  type ResourcePolicy,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import { digest } from "@/features/auth/sessions";
import { DomainError } from "@/lib/errors";
import { sourceInput, contributionInput } from "./schema";

type RecordRow = {
  id: string;
  patient_person_id: string;
  origin_person_id: string;
  category: string;
  visibility: ResourcePolicy["visibility"];
  author_account_id: string;
  original_context: string;
  original_organization_id: string | null;
  source_status: string;
  source_timezone: string;
  version: number;
  logical_id: string;
};
function policy(row: RecordRow): ResourcePolicy {
  return {
    patientPersonId: row.patient_person_id,
    originPersonId: row.origin_person_id,
    category: row.category,
    visibility: row.visibility,
    authorAccountId: row.author_account_id,
    originalContext: row.original_context,
    originalOrganizationId: row.original_organization_id,
  };
}

export async function recordSource(
  pool: Pool,
  session: string,
  context: unknown,
  input: unknown,
) {
  return withAccess(pool, session, context, (access) =>
    recordSourceInAccess(access, input),
  );
}

/** Internal composition inside an already established, current access transaction. */
export async function recordSourceInAccess(
  access: AccessTransaction,
  input: unknown,
) {
  const data = sourceInput.parse(input);
  await access.tx.query(
    "select pg_advisory_xact_lock(hashtextextended($1,0))",
    [`source-client:${access.actor.accountId}:${data.clientKey}`],
  );
  const resource: ResourcePolicy = {
    patientPersonId: data.patientPersonId,
    originPersonId: data.patientPersonId,
    authorAccountId: access.actor.accountId,
    originalContext: access.contextId,
    originalOrganizationId:
      access.context.kind === "organization" ||
      access.context.kind === "initial-care"
        ? access.context.organizationId
        : null,
    category: data.category,
    visibility: data.visibility,
  };
  await authorize(access, resource, "write");
  const status =
    access.context.kind === "patient"
      ? data.uploaded
        ? "patient-uploaded"
        : "patient-reported"
      : data.visibility === "finalized"
        ? "professional-finalized"
        : "professional-draft";
  let capturedAt: Date | null = null;
  if (data.messageId) {
    const message = (
      await access.tx.query(
        "select * from mhistree.chat_messages where id=$1 and role='patient'",
        [data.messageId],
      )
    ).rows[0];
    if (
      !message ||
      access.context.kind !== "patient" ||
      message.person_id !== data.patientPersonId ||
      message.content !== data.content ||
      message.timezone !== data.sourceTimezone ||
      data.uploaded
    )
      throw new DomainError("ACCESS_DENIED");
    capturedAt = message.captured_at;
  }
  if (data.parentSourceId) {
    const original = (
      await access.tx.query("select * from mhistree.sources where id=$1", [
        data.parentSourceId,
      ])
    ).rows[0];
    if (
      !original ||
      access.context.kind !== "patient" ||
      original.patient_person_id !== data.patientPersonId ||
      original.source_status !== "patient-uploaded" ||
      !data.uploaded
    )
      throw new DomainError("ACCESS_DENIED");
    capturedAt = original.captured_at;
  }
  if (access.context.kind !== "patient" && data.uploaded)
    throw new DomainError("ACCESS_DENIED");
  const existing = (
    await access.tx.query(
      "select * from mhistree.sources where author_account_id=$1 and client_key=$2",
      [access.actor.accountId, data.clientKey],
    )
  ).rows[0];
  if (existing) {
    if (
      existing.content !== data.content ||
      existing.patient_person_id !== data.patientPersonId ||
      existing.original_context !== access.contextId ||
      existing.category !== data.category ||
      existing.visibility !== data.visibility ||
      existing.source_timezone !== data.sourceTimezone ||
      existing.source_status !== status ||
      existing.chat_message_id !== (data.messageId ?? null) ||
      existing.parent_source_id !== (data.parentSourceId ?? null)
    )
      throw new DomainError("VERSION_CONFLICT");
    return {
      sourceId: existing.id as string,
      version: existing.version as number,
    };
  }
  const row = (
    await access.tx.query(
      `insert into mhistree.sources(patient_person_id,origin_person_id,author_account_id,original_context,original_organization_id,category,visibility,source_status,source_timezone,content,client_key,captured_at,chat_message_id,parent_source_id) values($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,clock_timestamp()),$12,$13) returning id,version`,
      [
        data.patientPersonId,
        access.actor.accountId,
        access.contextId,
        resource.originalOrganizationId,
        data.category,
        data.visibility,
        status,
        data.sourceTimezone,
        data.content,
        data.clientKey,
        capturedAt,
        data.messageId ?? null,
        data.parentSourceId ?? null,
      ],
    )
  ).rows[0];
  await appendEvent(access.tx, {
    actorAccountId: access.actor.accountId,
    personId: data.patientPersonId,
    action: "source.recorded",
    contextId: access.contextId,
    referenceId: row.id,
  });
  return { sourceId: row.id as string, version: row.version as number };
}

export async function acceptContribution(
  pool: Pool,
  session: string,
  context: unknown,
  input: unknown,
) {
  return withAccess(pool, session, context, (access) =>
    acceptContributionInAccess(access, input),
  );
}

/** Internal composition inside an already established, current access transaction. */
export async function acceptContributionInAccess(
  access: AccessTransaction,
  input: unknown,
) {
  const data = contributionInput.parse(input);
  await access.tx.query(
    "select pg_advisory_xact_lock(hashtextextended($1,0))",
    [`record:${data.operationKey}`],
  );
  await access.tx.query(
    "select pg_advisory_xact_lock(hashtextextended($1,0))",
    [`source:${data.sourceId}:${data.sourceVersion}:${data.sourceItemId}`],
  );
  const source = (
    await access.tx.query<RecordRow>(
      "select * from mhistree.sources where id=$1 and version=$2",
      [data.sourceId, data.sourceVersion],
    )
  ).rows[0];
  if (!source) throw new DomainError("ACCESS_DENIED");
  await authorize(access, policy(source), "write");
  if (
    source.author_account_id !== access.actor.accountId ||
    source.original_context !== access.contextId
  )
    throw new DomainError("ACCESS_DENIED");
  const bodyHash = digest(JSON.stringify({ ...data, operationKey: undefined }));
  const replay = (
    await access.tx.query(
      "select * from mhistree.record_operations where operation_key=$1",
      [data.operationKey],
    )
  ).rows[0];
  if (replay) {
    if (
      replay.actor_account_id !== access.actor.accountId ||
      replay.context_id !== access.contextId ||
      replay.body_hash !== bodyHash
    )
      throw new DomainError("VERSION_CONFLICT");
    return { eventId: replay.event_id as string, replayed: true };
  }
  const operation = data.correction ? "correct" : "accept";
  const sameItem = (
    await access.tx.query(
      "select e.id,o.body_hash from mhistree.contributions e join mhistree.record_operations o on o.event_id=e.id where e.source_id=$1 and e.source_version=$2 and e.source_item_id=$3 and e.operation_kind=$4 limit 1",
      [source.id, data.sourceVersion, data.sourceItemId, operation],
    )
  ).rows[0];
  if (sameItem) {
    if (sameItem.body_hash !== bodyHash)
      throw new DomainError("VERSION_CONFLICT");
    await access.tx.query(
      "insert into mhistree.record_operations(operation_key,actor_account_id,context_id,body_hash,event_id) values($1,$2,$3,$4,$5)",
      [
        data.operationKey,
        access.actor.accountId,
        access.contextId,
        bodyHash,
        sameItem.id,
      ],
    );
    return { eventId: sameItem.id as string, replayed: true };
  }
  let logicalId: string = randomUUID(),
    version = 1,
    supersedes: string | null = null;
  if (data.body.contextLinks.length) {
    const linked = await access.tx.query(
      "select id from mhistree.contributions where id=any($1::uuid[]) and patient_person_id=$2",
      [data.body.contextLinks, source.patient_person_id],
    );
    if (linked.rowCount !== new Set(data.body.contextLinks).size)
      throw new DomainError("ACCESS_DENIED");
  }
  if (data.body.episodeUpdate) {
    const update = data.body.episodeUpdate;
    const prior = (
      await access.tx.query(
        `select e.id,e.version,e.category,e.source_status,e.author_account_id from mhistree.record_heads h
       join mhistree.contributions e on e.id=h.current_id
       where e.id=$1 and e.patient_person_id=$2 for share of h`,
        [update.eventId, source.patient_person_id],
      )
    ).rows[0];
    if (!prior || prior.version !== update.expectedVersion)
      throw new DomainError("VERSION_CONFLICT");
    if (
      data.correction ||
      source.category !== "symptom" ||
      prior.category !== "symptom" ||
      prior.source_status !== "patient-reported" ||
      source.source_status !== "patient-reported" ||
      prior.author_account_id !== access.actor.accountId ||
      !data.body.contextLinks.includes(prior.id)
    )
      throw new DomainError("ACCESS_DENIED");
  }
  if (data.correction) {
    const head = (
      await access.tx.query(
        "select * from mhistree.record_heads where logical_id=$1 for update",
        [data.correction.logicalId],
      )
    ).rows[0];
    if (!head || head.version !== data.correction.expectedVersion)
      throw new DomainError("VERSION_CONFLICT");
    const prior = (
      await access.tx.query<RecordRow>(
        "select * from mhistree.contributions where id=$1",
        [head.current_id],
      )
    ).rows[0];
    if (
      !prior ||
      prior.author_account_id !== access.actor.accountId ||
      prior.patient_person_id !== source.patient_person_id ||
      prior.category !== source.category ||
      prior.visibility !== source.visibility ||
      prior.original_context !== source.original_context ||
      prior.origin_person_id !== source.origin_person_id ||
      prior.original_organization_id !== source.original_organization_id
    )
      throw new DomainError("ACCESS_DENIED");
    if (
      access.context.kind === "patient" &&
      prior.source_status === "professional-finalized"
    )
      throw new DomainError("ACCESS_DENIED");
    logicalId = data.correction.logicalId;
    version = head.version + 1;
    supersedes = head.current_id;
  }
  const id = randomUUID();
  await access.tx.query(
    `insert into mhistree.contributions(id,logical_id,version,patient_person_id,origin_person_id,source_id,source_version,source_item_id,operation_kind,author_account_id,original_context,original_organization_id,category,visibility,source_status,occurred_at,source_timezone,body,source_spans,status,supersedes_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [
      id,
      logicalId,
      version,
      source.patient_person_id,
      source.origin_person_id,
      source.id,
      data.sourceVersion,
      data.sourceItemId,
      operation,
      access.actor.accountId,
      source.original_context,
      source.original_organization_id,
      source.category,
      source.visibility,
      source.source_status,
      JSON.stringify(data.occurredAt),
      source.source_timezone,
      JSON.stringify(data.body),
      data.sourceSpans,
      data.status,
      supersedes,
    ],
  );
  await access.tx.query(
    "insert into mhistree.record_heads(logical_id,current_id,version) values($1,$2,$3) on conflict(logical_id) do update set current_id=excluded.current_id,version=excluded.version",
    [logicalId, id, version],
  );
  if (
    source.visibility === "finalized" &&
    ["medication-use", "allergy", "baseline", "ongoing"].includes(
      source.category,
    )
  )
    await access.tx.query(
      "insert into mhistree.persistent_state(logical_id,event_id,category,status,body) values($1,$2,$3,$4,$5) on conflict(logical_id) do update set event_id=excluded.event_id,status=excluded.status,body=excluded.body",
      [logicalId, id, source.category, data.status, JSON.stringify(data.body)],
    );
  await access.tx.query(
    "insert into mhistree.record_operations(operation_key,actor_account_id,context_id,body_hash,event_id) values($1,$2,$3,$4,$5)",
    [data.operationKey, access.actor.accountId, access.contextId, bodyHash, id],
  );
  await appendEvent(access.tx, {
    actorAccountId: access.actor.accountId,
    personId: source.patient_person_id,
    action: `record.${operation}`,
    contextId: access.contextId,
    referenceId: id,
  });
  await access.tx.query(
    "insert into mhistree.outbox(kind,reference_id) values('record.accepted',$1)",
    [id],
  );
  return { eventId: id, replayed: false };
}

export async function readContribution(
  pool: Pool,
  session: string,
  context: ActingContext,
  eventId: string,
) {
  z.uuid().parse(eventId);
  return withAccess(pool, session, context, async (access) => {
    const row = (
      await access.tx.query(
        "select * from mhistree.contributions where id=$1",
        [eventId],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    await appendEvent(access.tx, {
      actorAccountId: access.actor.accountId,
      personId: row.patient_person_id,
      action: "record.read",
      contextId: access.contextId,
      referenceId: eventId,
    });
    return row;
  });
}
