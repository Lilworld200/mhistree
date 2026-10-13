import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
import { requireOrganization } from "./server";

export const organizationPrivileges = [
  "organization.manage",
  "person.lookup",
  "person.register",
  "auth.activate",
  "consent.manage",
  "assignments.manage",
  "records.read",
  "records.write",
  "appointments.manage",
  "messages.send",
  "requests.read",
  "requests.create",
  "results.finalize",
] as const;
const privileges = z
  .array(z.enum(organizationPrivileges))
  .max(organizationPrivileges.length);

async function syncAuthority(
  tx: PoolClient,
  organizationId: string,
  accountId: string,
  enabled: boolean,
  grants: string[],
) {
  await tx.query(
    "insert into mhistree.staff_authorities(account_id,context_id,organization_id,privileges,evidence_reference,active) values($1,$2,$3,$4,'Organization membership decision',$5) on conflict(account_id,context_id) do update set privileges=excluded.privileges,active=excluded.active",
    [
      accountId,
      `organization:${organizationId}`,
      organizationId,
      grants.filter((p) =>
        ["person.lookup", "person.register", "auth.activate"].includes(p),
      ),
      enabled,
    ],
  );
}

export async function organizationStaff(
  pool: Pool,
  session: string,
  organizationId: string,
) {
  return transaction(async (tx) => {
    z.uuid().parse(organizationId);
    const actor = await verifySession(tx, session);
    const membership = (
      await tx.query(
        "select m.privileges from mhistree.memberships m join mhistree.organizations o on o.id=m.organization_id where o.id=$1 and o.status='approved' and m.account_id=$2 and m.active and m.privileges && '{organization.manage,consent.manage,assignments.manage}'::text[] for share of m,o",
        [organizationId, actor.accountId],
      )
    ).rows[0];
    if (!membership) throw new DomainError("ACCESS_DENIED");
    const canManage = membership.privileges.includes("organization.manage");
    return {
      privileges: membership.privileges as string[],
      members:
        canManage || membership.privileges.includes("assignments.manage")
          ? (
              await tx.query(
                "select m.account_id,m.active,m.privileges,m.version,p.display_name,pr.status qualification from mhistree.memberships m join mhistree.accounts a on a.id=m.account_id join mhistree.persons p on p.id=a.person_id left join mhistree.professionals pr on pr.account_id=a.id where m.organization_id=$1 order by p.display_name,m.account_id limit 100",
                [organizationId],
              )
            ).rows
          : [],
      invitations: canManage
        ? (
            await tx.query(
              "select id,account_id,privileges,state,expires_at from mhistree.organization_invitations where organization_id=$1 order by created_at desc limit 100",
              [organizationId],
            )
          ).rows
        : [],
    };
  }, pool);
}

export async function inviteStaff(pool: Pool, session: string, input: unknown) {
  const d = z
    .object({ organizationId: z.uuid(), accountId: z.uuid(), privileges })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await requireOrganization(
      tx,
      session,
      d.organizationId,
      "organization.manage",
    );
    if (actor.accountId === d.accountId) throw new DomainError("ACCESS_DENIED");
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `member:${d.organizationId}:${d.accountId}`,
    ]);
    if (
      !(
        await tx.query(
          "select 1 from mhistree.accounts where id=$1 and status='active'",
          [d.accountId],
        )
      ).rowCount ||
      (
        await tx.query(
          "select 1 from mhistree.memberships where organization_id=$1 and account_id=$2 and active",
          [d.organizationId, d.accountId],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    await tx.query(
      "update mhistree.organization_invitations set state='replaced' where organization_id=$1 and account_id=$2 and state='pending'",
      [d.organizationId, d.accountId],
    );
    const row = (
      await tx.query(
        "insert into mhistree.organization_invitations(organization_id,account_id,invited_by,privileges) values($1,$2,$3,$4) returning id",
        [
          d.organizationId,
          d.accountId,
          actor.accountId,
          [...new Set(d.privileges)],
        ],
      )
    ).rows[0];
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "organization.invited",
      referenceId: row.id,
      contextId: `organization:${d.organizationId}`,
    });
    return row;
  }, pool);
}

export async function myInvitations(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    return (
      await tx.query(
        "select i.id,i.organization_id,o.display_name,i.privileges,i.expires_at from mhistree.organization_invitations i join mhistree.organizations o on o.id=i.organization_id where i.account_id=$1 and i.state='pending' and i.expires_at>clock_timestamp() and o.status='approved' order by i.created_at desc limit 100",
        [actor.accountId],
      )
    ).rows;
  }, pool);
}

export async function respondInvitation(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({ id: z.uuid(), accept: z.boolean() })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const invite = (
      await tx.query(
        "select i.* from mhistree.organization_invitations i join mhistree.organizations o on o.id=i.organization_id where i.id=$1 and i.account_id=$2 and i.state='pending' and i.expires_at>clock_timestamp() and o.status='approved' for update of i",
        [d.id, actor.accountId],
      )
    ).rows[0];
    if (!invite) throw new DomainError("ACCESS_DENIED");
    await tx.query(
      "update mhistree.organization_invitations set state=$2 where id=$1",
      [d.id, d.accept ? "accepted" : "declined"],
    );
    if (d.accept) {
      await tx.query(
        "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,$3) on conflict(organization_id,account_id) do update set active=true,privileges=excluded.privileges,version=mhistree.memberships.version+1",
        [invite.organization_id, actor.accountId, invite.privileges],
      );
      await syncAuthority(
        tx,
        invite.organization_id,
        actor.accountId,
        true,
        invite.privileges,
      );
    }
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "organization.membership.updated",
      referenceId: d.id,
      contextId: `organization:${invite.organization_id}`,
    });
    return { accepted: d.accept };
  }, pool);
}

export async function updateMembership(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      accountId: z.uuid(),
      version: z.number().int().positive(),
      active: z.boolean(),
      privileges,
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await requireOrganization(
      tx,
      session,
      d.organizationId,
      "organization.manage",
    );
    if (actor.accountId === d.accountId) throw new DomainError("ACCESS_DENIED");
    const changed = await tx.query(
      "update mhistree.memberships set active=$4,privileges=$5,version=version+1 where organization_id=$1 and account_id=$2 and version=$3 returning version",
      [
        d.organizationId,
        d.accountId,
        d.version,
        d.active,
        [...new Set(d.privileges)],
      ],
    );
    if (!changed.rowCount) throw new DomainError("VERSION_CONFLICT");
    await syncAuthority(
      tx,
      d.organizationId,
      d.accountId,
      d.active,
      d.privileges,
    );
    // Privilege changes retire assignments; restoring membership cannot resume old work.
    await tx.query(
      "update mhistree.assignments set active=false,version=version+1 where organization_id=$1 and account_id=$2 and active",
      [d.organizationId, d.accountId],
    );
    await tx.query(
      "update mhistree.clinical_work set state='paused',updated_at=clock_timestamp(),version=version+1 where organization_id=$1 and author_account_id=$2 and state='draft'",
      [d.organizationId, d.accountId],
    );
    await tx.query(
      "update mhistree.service_requests set paused_from=state,state='paused',version=version+1 where state not in('finalized','cancelled','paused') and ((requester_account_id=$2 and connection_id in(select id from mhistree.connections where organization_id=$1)) or (recipient_account_id=$2 and recipient_connection_id in(select id from mhistree.connections where organization_id=$1)))",
      [d.organizationId, d.accountId],
    );
    await tx.query(
      "update mhistree.appointments set state='paused',version=version+1 where practitioner_account_id=$2 and connection_id in(select id from mhistree.connections where organization_id=$1) and state in('requested','accepted')",
      [d.organizationId, d.accountId],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "organization.membership.updated",
      referenceId: d.accountId,
      contextId: `organization:${d.organizationId}`,
    });
    return changed.rows[0];
  }, pool);
}
