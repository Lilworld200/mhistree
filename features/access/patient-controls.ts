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
        `select c.id,c.kind,c.status,c.revision,c.patient_approved,c.practitioner_approved,
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

export type ConnectedPractitionerSummary = {
  connectionId: string;
  name: string;
  kind: "direct" | "organization";
  canMessage: boolean;
  categories: string[];
  revision: number;
  practitionerId: string;
  assignmentId: string | null;
};

/** Minimum identity projection, before any restricted clinical transaction.
 * Identity comes only from the verified session; this is not a clinical grant. */
export async function getConnectedPractitioners(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    return careRecipientsInTransaction(tx, actor, "messages.send");
  }, pool);
}

/** Minimum identities only, called before SET ROLE in the same authorized transaction. */
export async function careRecipientsInTransaction(
  tx: PoolClient,
  actor: VerifiedSession,
  privilege: "messages.send" | "appointments.manage",
) {
  const rows = (
    await tx.query(
      `select c.id,c.kind,c.revision,p.display_name,a.id practitioner_id,
        assignment.id assignment_id,
        array(select cat from unnest(scope.categories) cat
          where not(cat=any(scope.exclusions))
          and (c.kind='direct' or cat=any(assignment.categories)) order by cat) categories
       from mhistree.connections c
       join lateral(select * from mhistree.consents where connection_id=c.id
         order by recorded_at desc,id desc limit 1) scope on true
       join mhistree.accounts a on a.status='active' and
         (c.kind='direct' and a.id=c.practitioner_account_id or c.kind='organization')
       join mhistree.professionals prof on prof.account_id=a.id and prof.status='approved'
         and $3=any(prof.privileges) and 'records.read'=any(prof.privileges)
       join mhistree.persons p on p.id=a.person_id
       left join mhistree.organizations o on o.id=c.organization_id
       left join mhistree.memberships member on member.organization_id=c.organization_id
         and member.account_id=a.id and member.active
       left join mhistree.assignments assignment on assignment.organization_id=c.organization_id
         and assignment.account_id=a.id and assignment.patient_person_id=c.patient_person_id and assignment.active
       where mhistree.canonical_person(c.patient_person_id)=$1 and c.status='active'
         and c.patient_person_id=any(scope.origin_person_ids)
         and ('*'=any(scope.origin_context_ids) or ('patient:'||$2::text)=any(scope.origin_context_ids))
         and (c.kind='direct' or (o.status='approved' and member.active
           and $3=any(member.privileges) and 'records.read'=any(member.privileges)
           and assignment.id is not null))
         and exists(select 1 from unnest(scope.categories) cat where not(cat=any(scope.exclusions))
           and (c.kind='direct' or cat=any(assignment.categories)))
       order by (select max(cm.sent_at) from mhistree.care_threads ct join mhistree.care_messages cm on cm.thread_id=ct.id where ct.connection_id=c.id and cm.author_account_id=$2::uuid) desc nulls last,scope.recorded_at desc,p.display_name,c.id,a.id,assignment.id limit 101 for share of c,a,prof`,
      [actor.personId, actor.accountId, privilege],
    )
  ).rows;
  const assignments = rows
    .filter((r) => r.kind === "organization")
    .map((r) => r.assignment_id);
  if (assignments.length)
    await tx.query(
      "select ass.id from mhistree.assignments ass join mhistree.memberships m on m.organization_id=ass.organization_id and m.account_id=ass.account_id join mhistree.organizations o on o.id=ass.organization_id where ass.id=any($1::uuid[]) for share of ass,m,o",
      [assignments],
    );
  return {
    status: "available" as const,
    bounded: rows.length > 100,
    connectedPractitioners: rows
      .slice(0, 100)
      .map((r): ConnectedPractitionerSummary => ({
        connectionId: r.id,
        name: r.display_name,
        kind: r.kind,
        canMessage: privilege === "messages.send",
        categories: r.categories,
        revision: r.revision,
        practitionerId: r.practitioner_id,
        assignmentId: r.assignment_id ?? null,
      })),
  };
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
  if (
    connection.kind === "direct" &&
    data.mode === "approve" &&
    connection.patient_approved &&
    !connection.practitioner_approved
  )
    throw new DomainError("VERSION_CONFLICT");
  let practitionerApproved = connection.practitioner_approved;
  if (connection.kind === "direct" && data.mode === "reconnect") {
    practitionerApproved = Boolean(
      (
        await tx.query(
          "select practitioner_auto_approve from mhistree.connection_approval_settings where account_id=$1 for share",
          [connection.practitioner_account_id],
        )
      ).rows[0]?.practitioner_auto_approve,
    );
  }
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
      "update mhistree.connections set status=$2,patient_approved=true,practitioner_approved=$3,revision=revision+1 where id=$1 returning revision",
      [
        connection.id,
        connection.kind !== "direct" || practitionerApproved
          ? "active"
          : "pending",
        practitionerApproved,
      ],
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
