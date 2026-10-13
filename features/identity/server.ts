import "server-only";
import { appendEvent } from "@/features/audit/server";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { DomainError } from "@/lib/errors";
import { verifySession, digest } from "@/features/auth/sessions";

export type RegistrationActor = { accountId: string; contextId: string };
const personInput = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    birthDate: z.iso.date().nullable().default(null),
    contacts: z
      .array(
        z.object({
          kind: z.enum(["email", "phone"]),
          address: z.string().trim().min(1).max(254),
        }),
      )
      .max(5)
      .default([]),
  })
  .strict();

/** Internal service input must come from verifiedSession, never request JSON. */
export async function requireStaff(
  tx: PoolClient,
  actor: RegistrationActor,
  privilege: string,
) {
  const result = await tx.query(
    `select s.organization_id from mhistree.staff_authorities s join mhistree.accounts a on a.id=s.account_id
    where s.account_id=$1 and s.context_id=$2 and s.active and $3=any(s.privileges) and a.status='active' for share of s,a`,
    [actor.accountId, actor.contextId, privilege],
  );
  if (!result.rowCount) throw new DomainError("ACCESS_DENIED");
  const authority = result.rows[0] as { organization_id: string | null };
  // T09 projections enforce affiliation independently of the capability record.
  if (authority.organization_id) {
    const organization = await tx.query(
      `select o.id from mhistree.organizations o join mhistree.memberships m on m.organization_id=o.id where o.id=$1 and o.status='approved' and m.account_id=$2 and m.active and $3=any(m.privileges) for share of o,m`,
      [authority.organization_id, actor.accountId, privilege],
    );
    if (!organization.rowCount) throw new DomainError("ACCESS_DENIED");
  } else if (privilege === "person.register") {
    const professional = await tx.query(
      `select account_id from mhistree.professionals where account_id=$1 and status='approved' for share`,
      [actor.accountId],
    );
    if (!professional.rowCount) throw new DomainError("ACCESS_DENIED");
  }
  return authority;
}

export async function registerPerson(
  pool: Pool,
  session: string,
  contextId: string,
  input: unknown,
) {
  const data = personInput.parse(input);
  return transaction(async (tx) => {
    const current = await verifySession(tx, session);
    const actor = { accountId: current.accountId, contextId };
    const authority = await requireStaff(tx, actor, "person.register");
    const id = randomUUID();
    const alias = `MH-${randomUUID()}`;
    await tx.query(
      `insert into mhistree.persons(id,display_name,birth_date,creator_account_id,original_context,original_organization_id) values($1,$2,$3,$4,$5,$6)`,
      [
        id,
        data.displayName,
        data.birthDate,
        actor.accountId,
        actor.contextId,
        authority.organization_id,
      ],
    );
    await tx.query(
      `insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values($1,$2,$2)`,
      [alias, id],
    );
    for (const contact of data.contacts)
      await tx.query(
        `insert into mhistree.contacts(person_id,kind,address) values($1,$2,$3) on conflict do nothing`,
        [id, contact.kind, contact.address],
      );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: id,
      action: "person.registered",
      contextId: actor.contextId,
    });
    return { personId: id, alias, identityStatus: "provisional" as const };
  }, pool);
}

export async function lookupPeople(
  pool: Pool,
  session: string,
  contextId: string,
  query: { exactAlias: string } | { namePrefix: string },
) {
  await consumeAttempt(pool, "identity.lookup", digest(session), 20);
  return transaction(async (tx) => {
    const current = await verifySession(tx, session);
    const actor = { accountId: current.accountId, contextId };
    await requireStaff(tx, actor, "person.lookup");
    const exact = "exactAlias" in query;
    const value = exact
      ? z.string().min(1).max(80).parse(query.exactAlias)
      : z.string().trim().min(3).max(80).parse(query.namePrefix);
    const sql = exact
      ? `select p.id,p.display_name,p.birth_date,p.identity_status from mhistree.patient_identifiers i join mhistree.persons p on p.id=mhistree.canonical_person(i.person_id) where i.alias=$1 limit 1`
      : `select id,display_name,birth_date,identity_status from mhistree.persons where lower(left(display_name,length($1)))=lower($1) order by created_at,id limit 10`;
    const { rows } = await tx.query(sql, [value]);
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "identity.lookup",
      contextId: actor.contextId,
    });
    return rows.map((row) => ({
      personId: row.id as string,
      displayName: row.display_name as string,
      birthDate: row.birth_date as Date | null,
      reviewRequired: row.identity_status !== "matched",
    }));
  }, pool);
}
