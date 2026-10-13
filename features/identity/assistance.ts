import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { requireStaff } from "./server";
import { requireOrganization } from "@/features/organizations/server";
import { issueCredential } from "@/features/auth/server";
import type { KeycloakProvider } from "@/lib/auth/keycloak";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
export async function identityReviewer(tx: PoolClient, session: string) {
  const actor = await verifySession(tx, session);
  await requireStaff(
    tx,
    { accountId: actor.accountId, contextId: "review:identity" },
    "identity.review",
  );
  return actor;
}
export async function assistedCredential(
  pool: Pool,
  provider: KeycloakProvider,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      personId: z.uuid(),
      purpose: z.enum(["activation", "recovery"]),
      verificationMethod: z.string().trim().min(5).max(60),
      evidenceReference: z.string().trim().min(20).max(120),
    })
    .strict()
    .parse(input);
  return issueCredential(pool, provider, session, {
    personId: d.personId,
    contextId: `organization:${d.organizationId}`,
    purpose: d.purpose,
    evidenceReference: `${d.verificationMethod}: ${d.evidenceReference}`,
  });
}
export async function designateRecovery(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      accountId: z.uuid(),
      active: z.boolean(),
      evidence: z.string().min(20).max(2000),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await identityReviewer(tx, session);
    if (actor.accountId === d.accountId) throw new DomainError("ACCESS_DENIED");
    const member = (
      await tx.query(
        "select m.* from mhistree.memberships m join mhistree.organizations o on o.id=m.organization_id where m.organization_id=$1 and m.account_id=$2 and m.active and o.status='approved' for update of m",
        [d.organizationId, d.accountId],
      )
    ).rows[0];
    if (!member) throw new DomainError("ACCESS_DENIED");
    const grants = (member.privileges as string[]).filter(
      (p) => p !== "auth.recover",
    );
    if (d.active) grants.push("auth.recover");
    await tx.query(
      "update mhistree.memberships set privileges=$3,version=version+1 where organization_id=$1 and account_id=$2",
      [d.organizationId, d.accountId, grants],
    );
    await tx.query(
      "insert into mhistree.staff_authorities(account_id,context_id,organization_id,privileges,evidence_reference) values($1,$2,$3,$4,$5) on conflict(account_id,context_id) do update set privileges=excluded.privileges,evidence_reference=excluded.evidence_reference,active=true",
      [
        d.accountId,
        `organization:${d.organizationId}`,
        d.organizationId,
        grants.filter((p) =>
          [
            "auth.activate",
            "auth.recover",
            "person.lookup",
            "person.register",
          ].includes(p),
        ),
        d.evidence,
      ],
    );
    const row = (
      await tx.query(
        "insert into mhistree.recovery_designations(organization_id,account_id,reviewer_account_id,evidence,active) values($1,$2,$3,$4,$5) returning id",
        [d.organizationId, d.accountId, actor.accountId, d.evidence, d.active],
      )
    ).rows[0];
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      contextId: `organization:${d.organizationId}`,
      referenceId: row.id,
      action: "identity.recovery.designated",
    });
    return row;
  }, pool);
}
export async function escalateIdentity(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      personId: z.uuid(),
      evidence: z.string().min(20).max(2000),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await requireOrganization(
      tx,
      session,
      d.organizationId,
      "person.lookup",
    );
    if (
      !(
        await tx.query(
          "select 1 from mhistree.persons where id=$1 and original_organization_id=$2 union all select 1 from mhistree.connections where patient_person_id=$1 and organization_id=$2 and status='active'",
          [d.personId, d.organizationId],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const row = (
      await tx.query(
        "insert into mhistree.identity_support_cases(person_id,organization_id,reporter_account_id,evidence) values($1,$2,$3,$4) returning id",
        [d.personId, d.organizationId, actor.accountId, d.evidence],
      )
    ).rows[0];
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      referenceId: row.id,
      action: "identity.support.requested",
    });
    return row;
  }, pool);
}
export async function identitySupportQueue(pool: Pool, session: string) {
  return transaction(async (tx) => {
    await identityReviewer(tx, session);
    return (
      await tx.query(
        "select c.*,p.display_name from mhistree.identity_support_cases c join mhistree.persons p on p.id=c.person_id order by c.created_at limit 100",
      )
    ).rows;
  }, pool);
}
export async function reviewIdentitySupport(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      decision: z.enum(["resolved", "rejected"]),
      evidence: z.string().min(20).max(2000),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await identityReviewer(tx, session);
    const changed = await tx.query(
      "update mhistree.identity_support_cases set state=$3,version=version+1 where id=$1 and version=$2 and state='pending' and reporter_account_id<>$4 returning id",
      [d.id, d.version, d.decision, actor.accountId],
    );
    if (!changed.rowCount) throw new DomainError("VERSION_CONFLICT");
    await tx.query(
      "insert into mhistree.identity_support_decisions(case_id,reviewer_account_id,decision,evidence) values($1,$2,$3,$4)",
      [d.id, actor.accountId, d.decision, d.evidence],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      referenceId: d.id,
      action: "identity.support.reviewed",
    });
    return changed.rows[0];
  }, pool);
}
