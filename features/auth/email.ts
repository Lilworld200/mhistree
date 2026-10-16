import { authDebugStage } from "@/lib/auth/temporary-debug";
import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import type { SupabaseProvider } from "@/lib/auth/supabase";
import { transaction } from "@/lib/db/client";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { DomainError } from "@/lib/errors";
import { appendEvent } from "@/features/audit/server";
import { digest, secret } from "./sessions";

const registration = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(200),
    birthDate: z.iso.date().nullable().default(null),
    requestKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();
function origin() {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new DomainError("CONFIGURATION_REQUIRED");
  return new URL(value).origin;
}
async function lock<T>(pool: Pool, key: string, work: () => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      key,
    ]);
    return await work();
  } finally {
    await client.query("select pg_advisory_unlock(hashtextextended($1,0))", [
      key,
    ]);
    client.release();
  }
}
export async function signupEmail(
  pool: Pool,
  provider: SupabaseProvider,
  input: unknown,
  network: string,
  setupSession?: string,
) {
  authDebugStage("signup.validate-fields");
  const data = registration.parse(input);
  authDebugStage("signup.database-rate-limit");
  await consumeAttempt(pool, "email.signup", network, 10, 3600);
  authDebugStage("signup.database-lock");
  return lock(pool, `email-signup:${digest(data.requestKey)}`, async () => {
    authDebugStage("signup.database-enrollment-lookup");
    const previous = (
      await pool.query(
        "select email,display_name,birth_date::text,target_person_id from mhistree.email_enrollments where request_digest=$1",
        [digest(data.requestKey)],
      )
    ).rows[0];
    if (previous) {
      if (
        previous.email !== data.email ||
        (!previous.target_person_id &&
          (previous.display_name !== data.displayName ||
            previous.birth_date !== data.birthDate))
      )
        throw new DomainError("VERSION_CONFLICT");
      return { verificationRequired: true };
    }
    const setup = setupSession
      ? (
          await pool.query(
            `select c.id,c.person_id,p.display_name,p.birth_date::text from mhistree.setup_sessions s join mhistree.setup_credentials c on c.id=s.credential_id join mhistree.persons p on p.id=c.person_id where s.digest=$1 and s.used_at is null and s.expires_at>clock_timestamp() and c.state='redeemed' and c.expires_at>clock_timestamp()`,
            [digest(setupSession)],
          )
        ).rows[0]
      : null;
    if (setupSession && !setup) throw new DomainError("TOKEN_INVALID");
    if (setup) {
      const account = (
        await pool.query(
          "select provider from mhistree.accounts where person_id=$1 and status<>'retired'",
          [setup.person_id],
        )
      ).rows[0];
      // Existing Supabase ownership uses password recovery; don't create another identity.
      if (account?.provider === "supabase")
        throw new DomainError("IDENTITY_REVIEW_REQUIRED");
    }
    authDebugStage("signup.supabase-create-and-send-email");
    const subject = await provider.signup(
      data.email,
      data.password,
      `${origin()}/auth/callback?flow=signup`,
    );
    if (!subject) return { verificationRequired: true };
    authDebugStage("signup.database-save-enrollment");
    await transaction(async (tx) => {
      if (setup) {
        const consumed = await tx.query(
          `update mhistree.setup_sessions set used_at=clock_timestamp() where digest=$1 and used_at is null and expires_at>clock_timestamp() returning credential_id`,
          [digest(setupSession!)],
        );
        if (!consumed.rowCount) throw new DomainError("TOKEN_INVALID");
      }
      await tx.query(
        `insert into mhistree.email_enrollments(request_digest,provider_subject,email,display_name,birth_date,target_person_id,credential_id) values($1,$2,$3,$4,$5,$6,$7)`,
        [
          digest(data.requestKey),
          subject,
          data.email,
          setup?.display_name ?? data.displayName,
          setup?.birth_date ?? data.birthDate,
          setup?.person_id ?? null,
          setup?.id ?? null,
        ],
      );
    }, pool);
    return { verificationRequired: true };
  });
}

/** Bind only the stored provider subject after live verified-email proof. Never match by email. */
async function establishAccount(
  pool: Pool,
  provider: SupabaseProvider,
  token: string,
  confirmation = false,
) {
  const proof = await provider.verify(token);
  return transaction(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `supabase:${proof.subject}`,
    ]);
    let account = (
      await tx.query(
        "select * from mhistree.accounts where provider='supabase' and provider_subject=$1 for update",
        [proof.subject],
      )
    ).rows[0];
    if (!account) {
      const pending = (
        await tx.query(
          "select * from mhistree.email_enrollments where provider_subject=$1 and completed_at is null and expires_at>clock_timestamp() for update",
          [proof.subject],
        )
      ).rows[0];
      if (!pending || pending.email !== proof.user.email?.toLowerCase())
        throw new DomainError("IDENTITY_REVIEW_REQUIRED");
      const personId = pending.target_person_id ?? randomUUID();
      if (pending.target_person_id) {
        const credential = (
          await tx.query(
            "select state from mhistree.setup_credentials where id=$1 for update",
            [pending.credential_id],
          )
        ).rows[0];
        if (credential?.state !== "redeemed")
          throw new DomainError("TOKEN_INVALID");
        const person = (
          await tx.query(
            "select canonical_person_id from mhistree.persons where id=$1 for update",
            [personId],
          )
        ).rows[0];
        if (
          !person ||
          (person.canonical_person_id &&
            person.canonical_person_id !== personId)
        )
          throw new DomainError("IDENTITY_REVIEW_REQUIRED");
        const old = (
          await tx.query(
            "select * from mhistree.accounts where person_id=$1 and status<>'retired' for update",
            [personId],
          )
        ).rows[0];
        if (old) {
          if (old.provider !== "keycloak" || old.status !== "recovery-pending")
            throw new DomainError("IDENTITY_REVIEW_REQUIRED");
          await tx.query(
            `insert into mhistree.auth_provider_transitions(account_id,old_provider,old_subject,new_provider,new_subject,credential_id) values($1,$2,$3,'supabase',$4,$5)`,
            [
              old.id,
              old.provider,
              old.provider_subject,
              proof.subject,
              pending.credential_id,
            ],
          );
          account = (
            await tx.query(
              "update mhistree.accounts set provider='supabase',provider_subject=$2,login_identifier=$3,status='active',session_epoch=session_epoch+1 where id=$1 returning *",
              [old.id, proof.subject, pending.email],
            )
          ).rows[0];
          await tx.query(
            "update mhistree.sessions set retired_at=clock_timestamp() where account_id=$1 and retired_at is null",
            [old.id],
          );
        }
      } else {
        await tx.query(
          "insert into mhistree.persons(id,display_name,birth_date,original_context) values($1,$2,$3,$4)",
          [
            personId,
            pending.display_name,
            pending.birth_date,
            `patient:${personId}`,
          ],
        );
        await tx.query(
          "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values($1,$2,$2)",
          [`MH-${randomUUID()}`, personId],
        );
      }
      if (!account)
        account = (
          await tx.query(
            "insert into mhistree.accounts(person_id,provider,provider_subject,login_identifier,status) values($1,'supabase',$2,$3,'active') returning *",
            [personId, proof.subject, pending.email],
          )
        ).rows[0];
      await tx.query(
        "insert into mhistree.contacts(person_id,kind,address,verified_at) values($1,'email',$2,clock_timestamp()) on conflict(person_id,kind,address) do update set verified_at=excluded.verified_at",
        [personId, pending.email],
      );
      await tx.query(
        "update mhistree.email_enrollments set completed_at=clock_timestamp() where provider_subject=$1",
        [proof.subject],
      );
      await appendEvent(tx, {
        personId,
        actorAccountId: account.id,
        action: "auth.supabase.activated",
      });
    }
    if (account.status !== "active") throw new DomainError("SESSION_RETIRED");
    if (
      account.provider_valid_after &&
      proof.issuedAt * 1000 <= new Date(account.provider_valid_after).getTime()
    )
      throw new DomainError("SESSION_RETIRED");
    if (confirmation) {
      const consumed = await tx.query(
        "insert into mhistree.email_confirmation_proofs(token_digest) values($1) on conflict do nothing returning token_digest",
        [digest(token)],
      );
      if (!consumed.rowCount) throw new DomainError("TOKEN_INVALID");
    }
    const session = secret();
    await tx.query(
      `insert into mhistree.sessions(digest,account_id,session_epoch,provider_session_id,provider_token_digest,expires_at) values($1,$2,$3,$4,$5,$6)`,
      [
        digest(session),
        account.id,
        account.session_epoch,
        proof.providerSessionId,
        digest(token),
        proof.expiresAt,
      ],
    );
    await tx.query(
      "update mhistree.accounts set last_successful_patient_login_at=clock_timestamp() where id=$1",
      [account.id],
    );
    await appendEvent(tx, {
      personId: account.person_id,
      actorAccountId: account.id,
      action: "auth.patient.login",
    });
    return { session, expiresAt: proof.expiresAt };
  }, pool);
}
export async function loginEmail(
  pool: Pool,
  provider: SupabaseProvider,
  email: string,
  password: string,
  network: string,
) {
  await consumeAttempt(pool, "email.login", network, 15);
  const result = await provider.signIn(
    z.email().parse(email).toLowerCase(),
    password,
  );
  return establishAccount(pool, provider, result.token);
}
export async function setupEmail(
  pool: Pool,
  provider: SupabaseProvider,
  input: unknown,
  setupSession: string,
  network: string,
) {
  const data = z
    .object({
      email: z.email().max(254),
      password: z.string().min(12).max(128),
      requestKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    })
    .strict()
    .parse(input);
  await consumeAttempt(pool, "email.setup", network, 10);
  const pending = (
    await pool.query(
      "select email from mhistree.email_enrollments where request_digest=$1 and target_person_id is not null and completed_at is null and expires_at>clock_timestamp()",
      [digest(data.requestKey)],
    )
  ).rows[0];
  if (pending) {
    if (pending.email !== data.email.toLowerCase())
      throw new DomainError("VERSION_CONFLICT");
    return { verificationRequired: true };
  }
  const setup = (
    await pool.query(
      `select c.id,c.person_id,c.purpose,a.id account_id,a.provider,a.provider_subject,a.login_identifier,a.status from mhistree.setup_sessions s join mhistree.setup_credentials c on c.id=s.credential_id left join mhistree.accounts a on a.person_id=c.person_id and a.status<>'retired' where s.digest=$1 and s.used_at is null and s.expires_at>clock_timestamp() and c.state='redeemed'`,
      [digest(setupSession)],
    )
  ).rows[0];
  if (!setup) throw new DomainError("TOKEN_INVALID");
  if (setup.provider === "supabase") {
    if (
      setup.purpose !== "recovery" ||
      setup.status !== "recovery-pending" ||
      data.email.toLowerCase() !== setup.login_identifier.toLowerCase()
    )
      throw new DomainError("IDENTITY_REVIEW_REQUIRED");
    return lock(pool, `auth:${setup.person_id}`, async () => {
      const fresh = await pool.query(
        `select 1 from mhistree.setup_sessions s join mhistree.setup_credentials c on c.id=s.credential_id join mhistree.accounts a on a.person_id=c.person_id where s.digest=$1 and s.used_at is null and s.expires_at>clock_timestamp() and c.state='redeemed' and a.id=$2 and a.status='recovery-pending'`,
        [digest(setupSession), setup.account_id],
      );
      if (!fresh.rowCount) throw new DomainError("TOKEN_INVALID");
      await provider.setPatientPassword(setup.provider_subject, data.password);
      await transaction(async (tx) => {
        const used = await tx.query(
          "update mhistree.setup_sessions set used_at=clock_timestamp() where digest=$1 and used_at is null and expires_at>clock_timestamp() returning digest",
          [digest(setupSession)],
        );
        if (!used.rowCount) throw new DomainError("TOKEN_INVALID");
        const changed = await tx.query(
          "update mhistree.accounts set status='active',session_epoch=session_epoch+1,provider_valid_after=clock_timestamp() where id=$1 and status='recovery-pending' returning id",
          [setup.account_id],
        );
        if (!changed.rowCount) throw new DomainError("SESSION_RETIRED");
        await tx.query(
          "update mhistree.auth_reconciliation set pending=false where person_id=$1",
          [setup.person_id],
        );
        await appendEvent(tx, {
          personId: setup.person_id,
          actorAccountId: setup.account_id,
          action: "auth.supabase.staff-recovery.completed",
          referenceId: setup.id,
        });
      }, pool);
      return { verificationRequired: false, loginIdentifier: data.email };
    });
  }
  return signupEmail(
    pool,
    provider,
    { ...data, displayName: "Account activation", birthDate: null },
    network,
    setupSession,
  );
}
export async function confirmEmail(
  pool: Pool,
  provider: SupabaseProvider,
  token: string,
  network: string,
) {
  await consumeAttempt(pool, "email.confirm", network, 15);
  return establishAccount(pool, provider, token, true);
}
export async function requestEmailReset(
  pool: Pool,
  provider: SupabaseProvider,
  email: string,
  network: string,
) {
  const address = z.email().max(254).parse(email).toLowerCase();
  await consumeAttempt(pool, "email.reset.network", network, 10, 3600);
  await consumeAttempt(pool, "email.reset.address", digest(address), 3, 3600);
  await provider.resetEmail(address, `${origin()}/auth/callback?flow=recovery`);
  return {
    message: "If this email has an account, a reset link will arrive shortly.",
  };
}
export async function resendVerification(
  pool: Pool,
  provider: SupabaseProvider,
  email: string,
  network: string,
) {
  const address = z.email().max(254).parse(email).toLowerCase();
  await consumeAttempt(pool, "email.verification.resend", network, 10, 3600);
  await consumeAttempt(
    pool,
    "email.verification.address",
    digest(address),
    3,
    3600,
  );
  await provider.resendVerification(
    address,
    `${origin()}/auth/callback?flow=signup`,
  );
  await pool.query(
    "update mhistree.email_enrollments set expires_at=clock_timestamp()+interval '1 hour' where email=$1 and completed_at is null",
    [address],
  );
  return {
    message:
      "If this email is awaiting verification, a new link will arrive shortly.",
  };
}
export async function resetEmailPassword(
  pool: Pool,
  provider: SupabaseProvider,
  token: string,
  password: string,
  network: string,
) {
  z.string().min(12).max(128).parse(password);
  await consumeAttempt(pool, "email.reset.complete", network, 10);
  const proof = await provider.verify(token);
  if (Date.now() / 1000 - proof.issuedAt > 600)
    throw new DomainError("TOKEN_INVALID");
  if (
    !proof.methods.some((method) => method === "otp" || method === "recovery")
  )
    throw new DomainError("AUTH_REQUIRED");
  const identity = (
    await pool.query(
      "select person_id from mhistree.accounts where provider='supabase' and provider_subject=$1",
      [proof.subject],
    )
  ).rows[0];
  if (!identity) throw new DomainError("IDENTITY_REVIEW_REQUIRED");
  return lock(pool, `auth:${identity.person_id}`, async () => {
    const account = await transaction(async (tx) => {
      const row = (
        await tx.query(
          "select * from mhistree.accounts where provider='supabase' and provider_subject=$1 and status in('active','recovery-pending') for update",
          [proof.subject],
        )
      ).rows[0];
      if (!row) throw new DomainError("IDENTITY_REVIEW_REQUIRED");
      const previous = (
        await tx.query(
          "select completed_at from mhistree.email_recovery_proofs where token_digest=$1",
          [digest(token)],
        )
      ).rows[0];
      if (previous?.completed_at) throw new DomainError("TOKEN_INVALID");
      if (
        !previous &&
        row.provider_valid_after &&
        proof.issuedAt * 1000 <= new Date(row.provider_valid_after).getTime()
      )
        throw new DomainError("TOKEN_INVALID");
      await tx.query(
        "insert into mhistree.email_recovery_proofs(token_digest,account_id) values($1,$2) on conflict do nothing",
        [digest(token), row.id],
      );
      await tx.query(
        "update mhistree.accounts set status='recovery-pending',session_epoch=session_epoch+1 where id=$1",
        [row.id],
      );
      await tx.query(
        "update mhistree.sessions set retired_at=clock_timestamp() where account_id=$1 and retired_at is null",
        [row.id],
      );
      return row;
    }, pool);
    await provider.updatePassword(token, password);
    await transaction(async (tx) => {
      const current = await tx.query(
        "update mhistree.accounts set status='active',provider_valid_after=clock_timestamp() where id=$1 and provider='supabase' and provider_subject=$2 and status='recovery-pending' returning id",
        [account.id, proof.subject],
      );
      if (!current.rowCount) throw new DomainError("SESSION_RETIRED");
      await tx.query(
        "update mhistree.email_recovery_proofs set completed_at=clock_timestamp() where token_digest=$1",
        [digest(token)],
      );
      await appendEvent(tx, {
        personId: account.person_id,
        actorAccountId: account.id,
        action: "auth.email.password-reset",
      });
    }, pool);
    return { next: "/auth" };
  });
}
