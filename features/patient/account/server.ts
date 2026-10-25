import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { digest, secret, verifySession } from "@/features/auth/sessions";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";

const details = z.object({
  displayName: z.string().trim().min(1).max(200),
  birthDate: z.iso.date().nullable().default(null),
});
const signup = details
  .extend({ requestKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
/** The random enrollment key is held only by this browser, never a public person locator. */
export async function beginRegistration(
  pool: Pool,
  input: unknown,
  networkKey: string,
) {
  const data = signup.parse(input);
  await consumeAttempt(pool, "signup.network", networkKey, 10, 3600);
  return transaction(async (tx) => {
    const requestDigest = digest(data.requestKey);
    const bodyDigest = digest(
      JSON.stringify([data.displayName, data.birthDate]),
    );
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `signup:${requestDigest}`,
    ]);
    const existing = (
      await tx.query(
        "select * from mhistree.self_enrollments where request_digest=$1",
        [requestDigest],
      )
    ).rows[0];
    let credentialId: string;
    if (existing) {
      if (existing.body_digest !== bodyDigest)
        throw new DomainError("VERSION_CONFLICT");
      const active = await tx.query(
        "select 1 from mhistree.accounts where person_id=$1",
        [existing.person_id],
      );
      if (active.rowCount) throw new DomainError("TOKEN_INVALID");
      const valid = await tx.query(
        "select 1 from mhistree.setup_credentials where id=$1 and expires_at>clock_timestamp() and state='redeemed'",
        [existing.credential_id],
      );
      if (!valid.rowCount) throw new DomainError("TOKEN_INVALID");
      credentialId = existing.credential_id;
    } else {
      const personId = randomUUID();
      credentialId = randomUUID();
      await tx.query(
        "insert into mhistree.persons(id,display_name,birth_date,original_context) values($1,$2,$3,$4)",
        [personId, data.displayName, data.birthDate, `patient:${personId}`],
      );
      await tx.query(
        "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values($1,$2,$2)",
        [`MH-${randomUUID()}`, personId],
      );
      await tx.query(
        "insert into mhistree.auth_enrollments(person_id,login_identifier) values($1,$2)",
        [personId, `u_${secret().slice(0, 22).toLowerCase()}`],
      );
      await tx.query(
        "insert into mhistree.setup_credentials(id,person_id,purpose,digest,expires_at,state,evidence_reference) values($1,$2,'activation',$3,clock_timestamp()+interval '20 minutes','redeemed','patient-self-registration')",
        [credentialId, personId, digest(secret())],
      );
      await tx.query(
        "insert into mhistree.self_enrollments(request_digest,person_id,credential_id,body_digest) values($1,$2,$3,$4)",
        [requestDigest, personId, credentialId, bodyDigest],
      );
      await appendEvent(tx, {
        personId,
        action: "person.self-registered",
        contextId: `patient:${personId}`,
      });
    }
    const setupSession = secret();
    await tx.query(
      "insert into mhistree.setup_sessions(digest,credential_id,expires_at) values($1,$2,clock_timestamp()+interval '10 minutes')",
      [digest(setupSession), credentialId],
    );
    return { setupSession };
  }, pool);
}

export async function accountProfile(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const person = (
      await tx.query(
        "select display_name,birth_date::text,profile_version from mhistree.persons where id=$1",
        [actor.personId],
      )
    ).rows[0];
    const account = (
      await tx.query(
        "select login_identifier,provider from mhistree.accounts where id=$1",
        [actor.accountId],
      )
    ).rows[0];
    const contacts = (
      await tx.query(
        "select id,kind,address,verified_at from mhistree.contacts where person_id=$1 order by id",
        [actor.personId],
      )
    ).rows;
    const identifier = (
      await tx.query(
        "select alias from mhistree.patient_identifiers where person_id=$1 and retired_at is null order by created_at,alias limit 1",
        [actor.personId],
      )
    ).rows[0];
    return {
      ...person,
      login_identifier: account.login_identifier,
      loginEmail:
        account.provider === "supabase" ? account.login_identifier : null,
      patientId: identifier?.alias ?? null,
      contacts,
      accountId: actor.accountId,
    };
  }, pool);
}
export async function updateProfile(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = details
    .extend({ version: z.number().int().positive() })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const result = await tx.query(
      "update mhistree.persons set display_name=$2,birth_date=$3,profile_version=profile_version+1 where id=$1 and profile_version=$4 returning profile_version",
      [actor.personId, data.displayName, data.birthDate, data.version],
    );
    if (!result.rowCount) throw new DomainError("VERSION_CONFLICT");
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: actor.personId,
      action: "profile.updated",
    });
    return { version: result.rows[0].profile_version };
  }, pool);
}
export async function addContact(pool: Pool, session: string, input: unknown) {
  const data = z
    .discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("email"), address: z.email().max(254) })
        .strict(),
      z
        .object({
          kind: z.literal("phone"),
          address: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
        })
        .strict(),
    ])
    .parse(input);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    await tx.query("select id from mhistree.persons where id=$1 for update", [
      actor.personId,
    ]);
    const count = Number(
      (
        await tx.query(
          "select count(*) from mhistree.contacts where person_id=$1",
          [actor.personId],
        )
      ).rows[0].count,
    );
    if (count >= 5) throw new DomainError("ACCESS_DENIED");
    await tx.query(
      "insert into mhistree.contacts(person_id,kind,address) values($1,$2,$3) on conflict do nothing",
      [
        actor.personId,
        data.kind,
        data.kind === "email" ? data.address.toLowerCase() : data.address,
      ],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: actor.personId,
      action: "contact.added-unverified",
    });
  }, pool);
}
export async function removeContact(pool: Pool, session: string, id: string) {
  z.uuid().parse(id);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const loginContact = await tx.query(
      `select 1 from mhistree.contacts c join mhistree.accounts a on a.person_id=c.person_id where c.id=$1 and a.id=$2 and a.provider='supabase' and c.kind='email' and lower(c.address)=lower(a.login_identifier)`,
      [id, actor.accountId],
    );
    if (loginContact.rowCount) throw new DomainError("ACCESS_DENIED");
    await tx.query(
      "delete from mhistree.contacts where id=$1 and person_id=$2",
      [id, actor.personId],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: actor.personId,
      action: "contact.removed",
      referenceId: id,
    });
  }, pool);
}
