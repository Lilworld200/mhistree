import "server-only";
import { appendEvent } from "@/features/audit/server";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { DomainError } from "@/lib/errors";
import { KeycloakProvider } from "@/lib/auth/keycloak";
import { requireStaff } from "@/features/identity/server";
import { digest, secret, verifySession } from "./sessions";

// A session-level advisory lock serializes credential changes without holding an
// open database transaction across provider I/O. Other patients remain independent.
async function withCredentialLock<T>(
  pool: Pool,
  personId: string,
  work: () => Promise<T>,
) {
  const lock = await pool.connect();
  try {
    await lock.query("select pg_advisory_lock(hashtextextended($1,0))", [
      `auth:${personId}`,
    ]);
    return await work();
  } finally {
    await lock.query("select pg_advisory_unlock(hashtextextended($1,0))", [
      `auth:${personId}`,
    ]);
    lock.release();
  }
}
const issueInput = z
  .object({
    personId: z.uuid(),
    contextId: z.string().min(1).max(200),
    purpose: z.enum(["activation", "recovery"]),
    evidenceReference: z.string().min(8).max(200),
  })
  .strict();

export async function issueCredential(
  pool: Pool,
  provider: KeycloakProvider,
  staffSession: string,
  input: unknown,
) {
  const data = issueInput.parse(input);
  await consumeAttempt(pool, "auth.issue", digest(staffSession), 10);
  return withCredentialLock(pool, data.personId, async () => {
    const code = secret();
    const issued = await transaction(async (tx) => {
      const actor = await verifySession(tx, staffSession);
      const authority = await requireStaff(
        tx,
        { accountId: actor.accountId, contextId: data.contextId },
        data.purpose === "activation" ? "auth.activate" : "auth.recover",
      );
      const person = await tx.query(
        "select id,original_organization_id from mhistree.persons where id=$1 and canonical_person_id is null for update",
        [data.personId],
      );
      if (!person.rowCount) throw new DomainError("ACCESS_DENIED");
      if (
        authority.organization_id &&
        person.rows[0].original_organization_id !== authority.organization_id &&
        !(
          await tx.query(
            "select 1 from mhistree.connections where patient_person_id=$1 and organization_id=$2 and status='active'",
            [data.personId, authority.organization_id],
          )
        ).rowCount
      )
        throw new DomainError("ACCESS_DENIED");
      const account = (
        await tx.query(
          "select * from mhistree.accounts where person_id=$1 and status<>'retired' for update",
          [data.personId],
        )
      ).rows[0];
      const retired = !account
        ? (
            await tx.query(
              "select * from mhistree.accounts where person_id=$1 and status='retired' order by last_successful_patient_login_at desc nulls last,id limit 1",
              [data.personId],
            )
          ).rows[0]
        : undefined;
      const reversed =
        retired &&
        (
          await tx.query(
            "select 1 from mhistree.merge_journal j join mhistree.merge_reversals r on r.merge_operation_id=j.operation_id where j.loser_id=$1",
            [data.personId],
          )
        ).rowCount;
      if (retired && (data.purpose !== "recovery" || !reversed))
        throw new DomainError("IDENTITY_REVIEW_REQUIRED");
      if (
        data.purpose === "activation"
          ? Boolean(account && account.status !== "setup")
          : !account && !reversed
      )
        throw new DomainError("ACCESS_DENIED");
      const id = randomUUID();
      await tx.query(
        `insert into mhistree.auth_enrollments(person_id,login_identifier) values($1,$2) on conflict(person_id) do nothing`,
        [
          data.personId,
          account?.login_identifier ??
            `u_${secret().slice(0, 22).toLowerCase()}`,
        ],
      );
      // Reversal never reactivates an old credential. Reviewed recovery starts a new provider enrollment.
      if (reversed)
        await tx.query(
          "update mhistree.auth_enrollments set login_identifier=$2,provider_subject=null where person_id=$1",
          [data.personId, `u_${secret().slice(0, 22).toLowerCase()}`],
        );
      await tx.query(
        `insert into mhistree.setup_credentials(id,person_id,purpose,digest,expires_at,issuer_account_id,evidence_reference) values($1,$2,$3,$4,clock_timestamp()+interval '20 minutes',$5,$6)`,
        [
          id,
          data.personId,
          data.purpose,
          digest(code),
          actor.accountId,
          data.evidenceReference,
        ],
      );
      await tx.query(
        `update mhistree.setup_credentials set state='replaced',replaced_by=$1 where person_id=$2 and id<>$1 and state<>'replaced'`,
        [id, data.personId],
      );
      if (data.purpose === "recovery") {
        const recoveryAccount = account ?? retired;
        await tx.query(
          `update mhistree.accounts set status='recovery-pending',session_epoch=session_epoch+1 where id=$1 and status<>'retired'`,
          [recoveryAccount.id],
        );
        await tx.query(
          `update mhistree.sessions set retired_at=clock_timestamp() where account_id=$1 and retired_at is null`,
          [recoveryAccount.id],
        );
        await tx.query(
          `insert into mhistree.auth_reconciliation(person_id,operation) values($1,'revoke-provider-sessions') on conflict(person_id) do update set pending=true,operation=excluded.operation,updated_at=clock_timestamp()`,
          [data.personId],
        );
      }
      await appendEvent(tx, {
        actorAccountId: actor.accountId,
        personId: data.personId,
        action: `auth.${data.purpose}.issued`,
        contextId: data.contextId,
        referenceId: id,
      });
      return {
        subject: (account ?? retired)?.provider_subject as string | undefined,
      };
    }, pool);
    let providerRevocationPending = false;
    if (issued.subject && data.purpose === "recovery") {
      try {
        await provider.revokeSessions(issued.subject);
        await pool.query(
          `update mhistree.auth_reconciliation set pending=false where person_id=$1`,
          [data.personId],
        );
      } catch {
        providerRevocationPending = true;
      }
    }
    return { code, expiresInSeconds: 1200, providerRevocationPending };
  });
}

/** requestKey must be a trusted transport-derived network/session key, not a submitted field. */
export async function redeemCredential(
  pool: Pool,
  code: string,
  requestKey: string,
) {
  await consumeAttempt(pool, "auth.redeem.network", requestKey, 10);
  await consumeAttempt(pool, "auth.redeem.code", digest(code), 5, 1200);
  return transaction(async (tx) => {
    const row = (
      await tx.query(
        `update mhistree.setup_credentials set state='redeemed' where digest=$1 and state='issued' and expires_at>clock_timestamp() returning id`,
        [digest(code)],
      )
    ).rows[0];
    if (!row) throw new DomainError("TOKEN_INVALID");
    const setupSession = secret();
    await tx.query(
      `insert into mhistree.setup_sessions(digest,credential_id,expires_at) values($1,$2,clock_timestamp()+interval '10 minutes')`,
      [digest(setupSession), row.id],
    );
    return { setupSession, scope: "password-setup" as const };
  }, pool);
}

export async function completeSetup(
  pool: Pool,
  provider: KeycloakProvider,
  setupSession: string,
  password: string,
  requestKey: string,
) {
  await consumeAttempt(pool, "auth.setup", requestKey, 10);
  // Do not trim passwords. Provider owns credential hashing and password policy.
  z.string().min(12).max(128).parse(password);
  const found = (
    await pool.query(
      `select c.person_id from mhistree.setup_sessions s join mhistree.setup_credentials c on c.id=s.credential_id where s.digest=$1`,
      [digest(setupSession)],
    )
  ).rows[0];
  if (!found) throw new DomainError("TOKEN_INVALID");
  return withCredentialLock(pool, found.person_id, async () => {
    const setup = (
      await pool.query(
        `select c.id,c.person_id,c.purpose,e.login_identifier,e.provider_subject from mhistree.setup_sessions s join mhistree.setup_credentials c on c.id=s.credential_id join mhistree.auth_enrollments e on e.person_id=c.person_id where s.digest=$1 and s.used_at is null and s.expires_at>clock_timestamp() and c.state='redeemed'`,
        [digest(setupSession)],
      )
    ).rows[0];
    if (!setup) throw new DomainError("TOKEN_INVALID");
    const subject =
      setup.provider_subject ??
      (await provider.ensureUser(setup.login_identifier));
    await pool.query(
      `update mhistree.auth_enrollments set provider_subject=$2 where person_id=$1`,
      [setup.person_id, subject],
    );
    // Retry is safe after an uncertain provider response: same subject, same restricted setup.
    await provider.revokeSessions(subject);
    await provider.setPatientPassword(subject, password);
    return transaction(async (tx) => {
      const consumed = await tx.query(
        `update mhistree.setup_sessions set used_at=clock_timestamp() where digest=$1 and used_at is null and expires_at>clock_timestamp() returning credential_id`,
        [digest(setupSession)],
      );
      if (!consumed.rowCount) throw new DomainError("TOKEN_INVALID");
      await tx.query(
        "update mhistree.setup_sessions set used_at=coalesce(used_at,clock_timestamp()) where credential_id=$1",
        [setup.id],
      );
      const activated = await tx.query(
        `insert into mhistree.accounts(person_id,provider,provider_subject,login_identifier,status) values($1,'keycloak',$2,$3,'active') on conflict(provider,provider_subject) do update set status='active',session_epoch=mhistree.accounts.session_epoch+1 where mhistree.accounts.status<>'retired'`,
        [setup.person_id, subject, setup.login_identifier],
      );
      if (!activated.rowCount)
        throw new DomainError("IDENTITY_REVIEW_REQUIRED");
      await tx.query(
        `update mhistree.auth_reconciliation set pending=false where person_id=$1`,
        [setup.person_id],
      );
      await appendEvent(tx, {
        personId: setup.person_id,
        action: "auth.password-setup.completed",
        referenceId: setup.id,
      });
      return { loginIdentifier: setup.login_identifier };
    }, pool);
  });
}

export async function signIn(
  pool: Pool,
  provider: KeycloakProvider,
  identifier: string,
  password: string,
  requestKey: string,
) {
  await consumeAttempt(pool, "auth.login.network", requestKey, 15);
  await consumeAttempt(
    pool,
    "auth.login.identifier",
    identifier.toLowerCase(),
    10,
    300,
  );
  const candidates = (
    await pool.query(
      `select a.id,a.provider_subject,a.session_epoch from mhistree.accounts a where a.status='active' and (a.login_identifier=$1 or exists(select 1 from mhistree.contacts c where c.person_id=a.person_id and c.kind='email' and lower(c.address)=lower($1) and c.verified_at is not null))`,
      [identifier],
    )
  ).rows;
  // Provider still checks every submitted login, keeping failure response uniform.
  const result = await provider.signIn(identifier, password);
  const before = candidates.find(
    (row) => row.provider_subject === result.claims.subject,
  );
  if (!before) throw new DomainError("AUTH_REQUIRED");
  return transaction(async (tx) => {
    const account = (
      await tx.query(
        `select id,person_id,session_epoch from mhistree.accounts where id=$1 and provider='keycloak' and provider_subject=$2 and status='active' and session_epoch=$3 for update`,
        [before.id, result.claims.subject, before.session_epoch],
      )
    ).rows[0];
    if (!account) throw new DomainError("AUTH_REQUIRED");
    const token = secret();
    await tx.query(
      `insert into mhistree.sessions(digest,account_id,session_epoch,provider_session_id,provider_token_digest,expires_at) values($1,$2,$3,$4,$5,$6)`,
      [
        digest(token),
        account.id,
        account.session_epoch,
        result.claims.providerSessionId,
        digest(result.token),
        result.claims.expiresAt,
      ],
    );
    await tx.query(
      `update mhistree.accounts set last_successful_patient_login_at=clock_timestamp() where id=$1`,
      [account.id],
    );
    await appendEvent(tx, {
      actorAccountId: account.id,
      personId: account.person_id,
      action: "auth.patient.login",
    });
    return { session: token, expiresAt: result.claims.expiresAt };
  }, pool);
}

export async function signOut(pool: Pool, token: string) {
  await transaction(async (tx) => {
    const actor = await verifySession(tx, token);
    await tx.query(
      `update mhistree.sessions set retired_at=clock_timestamp() where digest=$1`,
      [digest(token)],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: actor.personId,
      action: "auth.logout",
    });
  }, pool);
}
