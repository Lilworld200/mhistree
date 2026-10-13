import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { digest, verifySession } from "@/features/auth/sessions";
import { requireStaff } from "@/features/identity/server";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";

export async function requireOrganization(
  tx: PoolClient,
  session: string,
  organizationId: string,
  privilege: string,
) {
  z.uuid().parse(organizationId);
  const actor = await verifySession(tx, session);
  const row = await tx.query(
    "select o.id from mhistree.organizations o join mhistree.memberships m on m.organization_id=o.id where o.id=$1 and o.status='approved' and m.account_id=$2 and m.active and $3=any(m.privileges) for share of o,m",
    [organizationId, actor.accountId, privilege],
  );
  if (!row.rowCount) throw new DomainError("ACCESS_DENIED");
  return actor;
}

export async function organizationReviewer(tx: PoolClient, session: string) {
  const actor = await verifySession(tx, session);
  await requireStaff(
    tx,
    { accountId: actor.accountId, contextId: "review:organizations" },
    "organization.review",
  );
  return actor;
}

export async function myOrganizations(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    return (
      await tx.query(
        "select o.id,o.display_name,o.status,o.version,coalesce(m.privileges,'{}') privileges,a.legal_name,a.registration_number,a.jurisdiction,a.submitted_at from mhistree.organizations o join mhistree.organization_applications a on a.organization_id=o.id left join mhistree.memberships m on m.organization_id=o.id and m.account_id=$1 and m.active where a.applicant_account_id=$1 or m.account_id=$1 order by a.submitted_at desc limit 100",
        [actor.accountId],
      )
    ).rows;
  }, pool);
}

export async function registerOrganization(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      legalName: z.string().trim().min(2).max(200),
      registrationNumber: z.string().trim().min(1).max(100),
      jurisdiction: z.string().trim().min(2).max(100),
      address: z.string().trim().min(5).max(1000),
      administratorCapacity: z.string().trim().min(10).max(1000),
      requestKey: z.uuid(),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `organization:${d.requestKey}`,
    ]);
    const hash = digest(JSON.stringify(d));
    const previous = (
      await tx.query(
        "select * from mhistree.organization_applications where request_key=$1",
        [d.requestKey],
      )
    ).rows[0];
    if (previous) {
      if (
        previous.applicant_account_id !== actor.accountId ||
        previous.body_hash !== hash
      )
        throw new DomainError("VERSION_CONFLICT");
      return { id: previous.organization_id };
    }
    const org = (
      await tx.query(
        "insert into mhistree.organizations(status,display_name) values('pending',$1) returning id",
        [d.legalName],
      )
    ).rows[0];
    await tx.query(
      "insert into mhistree.organization_applications(organization_id,applicant_account_id,legal_name,registration_number,jurisdiction,address,administrator_capacity,request_key,body_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        org.id,
        actor.accountId,
        d.legalName,
        d.registrationNumber,
        d.jurisdiction,
        d.address,
        d.administratorCapacity,
        d.requestKey,
        hash,
      ],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "organization.submitted",
      referenceId: org.id,
    });
    return org as { id: string };
  }, pool);
}

export async function organizationReviewQueue(pool: Pool, session: string) {
  return transaction(async (tx) => {
    await organizationReviewer(tx, session);
    return (
      await tx.query(
        "select o.id,o.status,o.version,a.legal_name,a.registration_number,a.jurisdiction,a.address,a.administrator_capacity,a.applicant_account_id,a.submitted_at from mhistree.organizations o join mhistree.organization_applications a on a.organization_id=o.id order by a.submitted_at,o.id limit 100",
      )
    ).rows;
  }, pool);
}

export async function reviewOrganization(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      version: z.number().int().positive(),
      decision: z.enum(["approved", "rejected", "suspended"]),
      evidence: z.string().trim().min(20).max(3000),
      administratorEvidence: z.string().trim().min(20).max(3000),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await organizationReviewer(tx, session);
    const org = (
      await tx.query(
        "select o.*,a.applicant_account_id from mhistree.organizations o join mhistree.organization_applications a on a.organization_id=o.id where o.id=$1 for update of o",
        [d.organizationId],
      )
    ).rows[0];
    if (!org || org.applicant_account_id === actor.accountId)
      throw new DomainError("ACCESS_DENIED");
    if (org.version !== d.version) throw new DomainError("VERSION_CONFLICT");
    if (
      (d.decision === "rejected" && org.status !== "pending") ||
      (d.decision === "suspended" && org.status !== "approved") ||
      (d.decision === "approved" &&
        !["pending", "suspended"].includes(org.status))
    )
      throw new DomainError("VERSION_CONFLICT");
    await tx.query(
      "insert into mhistree.organization_reviews(organization_id,reviewer_account_id,decision,evidence,administrator_evidence,version) values($1,$2,$3,$4,$5,$6)",
      [
        org.id,
        actor.accountId,
        d.decision,
        d.evidence,
        d.administratorEvidence,
        d.version,
      ],
    );
    await tx.query(
      "update mhistree.organizations set status=$2,version=version+1 where id=$1",
      [org.id, d.decision],
    );
    // Reapproval never reinstates removed staff or clinical grants.
    if (d.decision === "approved" && org.status === "pending")
      await tx.query(
        "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{organization.manage}')",
        [org.id, org.applicant_account_id],
      );
    if (d.decision === "suspended") {
      await tx.query(
        "update mhistree.clinical_work set state='paused',updated_at=clock_timestamp(),version=version+1 where organization_id=$1 and connection_id is null and state='draft'",
        [org.id],
      );
      await tx.query(
        "update mhistree.connections set revision=revision+1 where organization_id=$1",
        [org.id],
      );
      await tx.query(
        "update mhistree.dependent_work set state='paused',paused_at=clock_timestamp() where connection_id in(select id from mhistree.connections where organization_id=$1) and state='pending'",
        [org.id],
      );
    }
    await tx.query(
      "insert into mhistree.outbox(kind,reference_id,revision) values('organization.status',$1,$2) on conflict do nothing",
      [org.id, d.version + 1],
    );
    await tx.query(
      "insert into mhistree.notifications(account_id,event_key,kind,reference_id) values($1,$2,'organization.status',$3) on conflict(account_id,event_key) do nothing",
      [
        org.applicant_account_id,
        `organization:${org.id}:${d.version + 1}`,
        org.id,
      ],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: `organization.${d.decision}`,
      referenceId: org.id,
    });
    return { status: d.decision, version: d.version + 1 };
  }, pool);
}
