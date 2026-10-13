import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { digest, verifySession } from "@/features/auth/sessions";
import { category } from "@/features/health-records/schema";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
import { requireOrganization } from "./server";

export async function connectOrganization(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      patientPersonId: z.uuid(),
      requestKey: z.uuid(),
      method: z.enum(["login", "in-person"]),
      categories: z.array(category).min(1).max(10),
      exclusions: z.array(category).max(10),
      evidence: z.string().trim().min(20).max(2000).optional(),
    })
    .strict()
    .refine((d) => d.method !== "in-person" || Boolean(d.evidence))
    .parse(input);
  if (d.exclusions.some((c) => !d.categories.includes(c)))
    throw new DomainError("ACCESS_DENIED");
  return transaction(async (tx) => {
    const actor = await requireOrganization(
      tx,
      session,
      d.organizationId,
      "consent.manage",
    );
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `org-consent:${d.organizationId}:${d.patientPersonId}`,
    ]);
    const hash = digest(JSON.stringify(d));
    const replay = (
      await tx.query(
        "select * from mhistree.organization_connection_operations where request_key=$1",
        [d.requestKey],
      )
    ).rows[0];
    if (replay) {
      if (
        replay.actor_account_id !== actor.accountId ||
        replay.body_hash !== hash
      )
        throw new DomainError("VERSION_CONFLICT");
      return { id: replay.connection_id };
    }
    let c = (
      await tx.query(
        "select * from mhistree.connections where organization_id=$1 and patient_person_id=$2 order by id limit 1 for update",
        [d.organizationId, d.patientPersonId],
      )
    ).rows[0];
    if (c && c.status !== "revoked") throw new DomainError("VERSION_CONFLICT");
    const prior = c
      ? (
          await tx.query(
            "select * from mhistree.consents where connection_id=$1 order by recorded_at desc,id desc limit 1",
            [c.id],
          )
        ).rows[0]
      : null;
    const status = d.method === "login" ? "pending" : "active";
    c = c
      ? (
          await tx.query(
            "update mhistree.connections set status=$2,revision=revision+1 where id=$1 returning *",
            [c.id, status],
          )
        ).rows[0]
      : (
          await tx.query(
            "insert into mhistree.connections(patient_person_id,kind,organization_id,status) values($1,'organization',$2,$3) returning *",
            [d.patientPersonId, d.organizationId, status],
          )
        ).rows[0];
    await tx.query(
      "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id,evidence_reference,predecessor_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        c.id,
        d.categories,
        d.exclusions,
        prior?.origin_person_ids ?? [d.patientPersonId],
        prior?.origin_context_ids ?? ["*"],
        d.method,
        actor.accountId,
        d.evidence ?? null,
        prior?.id ?? null,
      ],
    );
    await tx.query(
      "insert into mhistree.organization_connection_operations values($1,$2,$3,$4)",
      [d.requestKey, actor.accountId, c.id, hash],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: d.patientPersonId,
      contextId: `organization:${c.id}`,
      referenceId: c.id,
      action: "connection.consent.updated",
    });
    return { id: c.id, status };
  }, pool);
}

export async function assignPatient(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      connectionId: z.uuid(),
      accountId: z.uuid(),
      categories: z.array(category).min(1).max(10),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await requireOrganization(
      tx,
      session,
      d.organizationId,
      "assignments.manage",
    );
    const c = (
      await tx.query(
        "select * from mhistree.connections where id=$1 and organization_id=$2 and status='active' for share",
        [d.connectionId, d.organizationId],
      )
    ).rows[0];
    const member = (
      await tx.query(
        "select m.* from mhistree.memberships m join mhistree.professionals p on p.account_id=m.account_id where m.organization_id=$1 and m.account_id=$2 and m.active and p.status='approved' and 'records.read'=any(p.privileges) and 'records.read'=any(m.privileges) for share of m,p",
        [d.organizationId, d.accountId],
      )
    ).rows[0];
    if (!c || !member) throw new DomainError("ACCESS_DENIED");
    const consent = (
      await tx.query(
        "select * from mhistree.consents where connection_id=$1 order by recorded_at desc,id desc limit 1",
        [c.id],
      )
    ).rows[0];
    if (
      !consent ||
      d.categories.some(
        (k) =>
          !consent.categories.includes(k) || consent.exclusions.includes(k),
      )
    )
      throw new DomainError("ACCESS_DENIED");
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `assignment:${d.organizationId}:${c.patient_person_id}:${d.accountId}`,
    ]);
    await tx.query(
      "update mhistree.assignments set active=false,version=version+1 where organization_id=$1 and patient_person_id=$2 and account_id=$3 and active",
      [d.organizationId, c.patient_person_id, d.accountId],
    );
    const row = (
      await tx.query(
        "insert into mhistree.assignments(organization_id,patient_person_id,account_id,active,categories) values($1,$2,$3,true,$4) returning id",
        [
          d.organizationId,
          c.patient_person_id,
          d.accountId,
          [...new Set(d.categories)],
        ],
      )
    ).rows[0];
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: c.patient_person_id,
      action: "organization.assignment.updated",
      referenceId: row.id,
      contextId: `organization:${c.id}`,
    });
    return row;
  }, pool);
}

export async function assignedPatients(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    return (
      await tx.query(
        `select * from (
         select a.id assignment_id,o.id organization_id,o.display_name organization_name,c.id connection_id,null::uuid basis_id,c.patient_person_id,p.display_name,a.categories from mhistree.assignments a join mhistree.organizations o on o.id=a.organization_id and o.status='approved' join mhistree.memberships m on m.organization_id=o.id and m.account_id=a.account_id and m.active join mhistree.professionals pr on pr.account_id=a.account_id and pr.status='approved' join mhistree.connections c on c.organization_id=o.id and c.patient_person_id=a.patient_person_id and c.status='active' join mhistree.persons p on p.id=c.patient_person_id where a.account_id=$1 and a.active and 'records.read'=any(m.privileges) and 'records.read'=any(pr.privileges)
         union all
         select a.id,o.id,o.display_name,null::uuid,b.id,b.patient_person_id,p.display_name,a.categories from mhistree.initial_care_bases b join mhistree.assignments a on a.id=b.assignment_id and a.active join mhistree.organizations o on o.id=b.organization_id and o.status='approved' join mhistree.memberships m on m.organization_id=o.id and m.account_id=b.account_id and m.active join mhistree.professionals pr on pr.account_id=b.account_id and pr.status='approved' join mhistree.persons p on p.id=b.patient_person_id and p.canonical_person_id is null where b.account_id=$1 and b.active and 'records.read'=any(m.privileges) and 'records.read'=any(pr.privileges) and exists(select 1 from mhistree.staff_authorities s where s.account_id=b.account_id and s.context_id=b.origin_context and s.active and 'person.register'=any(s.privileges)) and not exists(select 1 from mhistree.accounts ac where ac.person_id=p.id and ac.status='active')
         ) permitted order by organization_name,display_name,assignment_id limit 100`,
        [actor.accountId],
      )
    ).rows;
  }, pool);
}
