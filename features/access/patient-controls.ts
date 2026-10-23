import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { verifySession, type VerifiedSession } from "@/features/auth/sessions";
import { appendEvent } from "@/features/audit/server";
import { category } from "@/features/health-records/schema";
import { DomainError } from "@/lib/errors";
export async function patientConnections(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const connections = (
      await tx.query(
        `select c.id,c.kind,c.status,c.revision,
 coalesce(p.display_name,o.display_name,case when c.kind='organization' then 'Organization awaiting profile details' else 'Practitioner' end) display_name,c.practitioner_account_id,
 s.categories,s.exclusions,s.method,s.recorded_at,s.origin_person_ids,s.origin_context_ids
 from mhistree.connections c left join mhistree.accounts a on a.id=c.practitioner_account_id left join mhistree.persons p on p.id=a.person_id
 left join mhistree.organizations o on o.id=c.organization_id
 left join lateral(select * from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s on true
 where mhistree.canonical_person(c.patient_person_id)=$1 order by c.kind,c.id`,
        [actor.personId],
      )
    ).rows;
    const requests = (
      await tx.query(
        "select id,kind,state,created_at from mhistree.patient_review_requests where account_id=$1 order by created_at desc limit 50",
        [actor.accountId],
      )
    ).rows;
    return { connections, requests };
  }, pool);
}
export const patientConsentSchema = z
  .object({
    connectionId: z.uuid(),
    version: z.number().int().positive(),
    mode: z.enum(["approve", "narrow", "reconnect"]),
    categories: z.array(category).min(1).max(10),
    exclusions: z.array(category).max(10),
  })
  .strict();
export async function setPatientConsent(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = patientConsentSchema.parse(input);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    return consentInTransaction(tx, actor, data);
  }, pool);
}
/** Shared patient confirmation for existing requests and patient-initiated connections. */
export async function consentInTransaction(
  tx: PoolClient,
  actor: VerifiedSession,
  data: z.infer<typeof patientConsentSchema>,
) {
  const connection = (
    await tx.query(
      "select * from mhistree.connections where id=$1 and mhistree.canonical_person(patient_person_id)=$2 for update",
      [data.connectionId, actor.personId],
    )
  ).rows[0];
  if (!connection) throw new DomainError("ACCESS_DENIED");
  if (connection.revision !== data.version)
    throw new DomainError("VERSION_CONFLICT");
  if (
    (data.mode === "approve" && connection.status !== "pending") ||
    (data.mode === "narrow" && connection.status !== "active") ||
    (data.mode === "reconnect" && connection.status !== "revoked")
  )
    throw new DomainError("VERSION_CONFLICT");
  if (connection.kind === "direct") {
    if (
      !(
        await tx.query(
          "select account_id from mhistree.professionals where account_id=$1 and status='approved' for share",
          [connection.practitioner_account_id],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
  } else if (
    !(
      await tx.query(
        "select id from mhistree.organizations where id=$1 and status='approved' for share",
        [connection.organization_id],
      )
    ).rowCount
  )
    throw new DomainError("ACCESS_DENIED");
  const prior = (
    await tx.query(
      "select * from mhistree.consents where connection_id=$1 order by recorded_at desc,id desc limit 1",
      [connection.id],
    )
  ).rows[0];
  if (
    data.mode === "narrow" &&
    (!prior ||
      data.categories.some((c) => !prior.categories.includes(c)) ||
      prior.exclusions.some(
        (c: string) => !data.exclusions.some((ex) => ex === c),
      ))
  )
    throw new DomainError("ACCESS_DENIED");
  const origins = prior?.origin_person_ids ?? [actor.personId];
  const contexts = prior?.origin_context_ids ?? ["*"];
  await tx.query(
    "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id,predecessor_id) values($1,$2,$3,$4,$5,'login',$6,$7)",
    [
      connection.id,
      [...new Set(data.categories)],
      [...new Set(data.exclusions)],
      origins,
      contexts,
      actor.accountId,
      prior?.id ?? null,
    ],
  );
  const changed = (
    await tx.query(
      "update mhistree.connections set status='active',revision=revision+1 where id=$1 returning revision",
      [connection.id],
    )
  ).rows[0];
  if (data.mode === "narrow")
    await tx.query(
      "update mhistree.dependent_work set state='paused',paused_at=clock_timestamp() where connection_id=$1 and state='pending'",
      [connection.id],
    );
  // Reconnection grants eligibility only. Never resume paused work here.
  await appendEvent(tx, {
    actorAccountId: actor.accountId,
    personId: actor.personId,
    action: "connection.consent.updated",
    contextId: connection.id,
    referenceId: connection.id,
  });
  await tx.query(
    "insert into mhistree.outbox(kind,reference_id,revision) values('access.invalidated',$1,$2)",
    [connection.id, changed.revision],
  );
  return { version: changed.revision };
}
