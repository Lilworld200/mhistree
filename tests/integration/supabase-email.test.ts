import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { SupabaseProvider } from "@/lib/auth/supabase";
import {
  signupEmail,
  confirmEmail,
  loginEmail,
  resetEmailPassword,
} from "@/features/auth/email";
import { digest, secret, verifySession } from "@/features/auth/sessions";
import { transaction } from "@/lib/db/client";
import { testDatabase } from "../helpers/postgres";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/[operation]/route";
import { database } from "@/lib/db/client";
import { removeContact } from "@/features/patient/account/server";

let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  process.env.APP_ORIGIN = "http://127.0.0.1:3101";
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
function fixture(subject = randomUUID()) {
  const email = `synthetic-${randomUUID()}@example.com`;
  const token = `proof-${randomUUID()}`;
  const proof = {
    subject,
    user: { id: subject, email, email_confirmed_at: new Date().toISOString() },
    issuedAt: Math.floor(Date.now() / 1000),
    methods: ["otp"],
    expiresAt: new Date(Date.now() + 3600000),
    providerSessionId: randomUUID(),
  };
  let updates = 0;
  const provider = {
    signup: async () => subject,
    verify: async () => proof,
    signIn: async () => ({ token, claims: proof }),
    updatePassword: async () => {
      updates++;
    },
    resetEmail: async () => {},
    setPatientPassword: async () => {
      updates++;
    },
  } as unknown as SupabaseProvider;
  return {
    subject,
    email,
    token,
    provider,
    proof,
    get updates() {
      return updates;
    },
  };
}
async function enroll(f: ReturnType<typeof fixture>) {
  return signupEmail(
    db.pool,
    f.provider,
    {
      email: f.email,
      password: "Synthetic-password-123!",
      displayName: "Synthetic Email Patient",
      birthDate: null,
      requestKey: secret(),
    },
    randomUUID(),
  );
}
it("requires email/password and creates no patient record before verified provider proof", async () => {
  const f = fixture();
  await expect(
    signupEmail(
      db.pool,
      f.provider,
      { displayName: "No credentials", requestKey: secret() },
      randomUUID(),
    ),
  ).rejects.toThrow();
  await enroll(f);
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.accounts where provider_subject=$1",
        [f.subject],
      )
    ).rows[0].n,
  ).toBe("0");
});
it("concurrent confirmation binds one person; proof replay and same-email wrong-subject cannot grant access", async () => {
  const f = fixture();
  await enroll(f);
  const attempts = await Promise.allSettled([
    confirmEmail(db.pool, f.provider, f.token, randomUUID()),
    confirmEmail(db.pool, f.provider, f.token, randomUUID()),
  ]);
  expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  const saved = (
    await db.pool.query(
      "select * from mhistree.accounts where provider_subject=$1",
      [f.subject],
    )
  ).rows;
  expect(saved).toHaveLength(1);
  const impostor = fixture();
  impostor.proof.user.email = f.email;
  await expect(
    confirmEmail(db.pool, impostor.provider, impostor.token, randomUUID()),
  ).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
});
it("setup approval binds the original staff-created person rather than creating another", async () => {
  const f = fixture(),
    personId = randomUUID(),
    credentialId = randomUUID(),
    setup = secret();
  await db.pool.query(
    "insert into mhistree.persons(id,display_name,original_context) values($1,'Synthetic Staff Patient','synthetic-org')",
    [personId],
  );
  await db.pool.query(
    "insert into mhistree.setup_credentials(id,person_id,purpose,digest,expires_at,state,evidence_reference) values($1,$2,'activation',$3,clock_timestamp()+interval '20 minutes','redeemed','synthetic-reviewed')",
    [credentialId, personId, digest(secret())],
  );
  await db.pool.query(
    "insert into mhistree.setup_sessions(digest,credential_id,expires_at) values($1,$2,clock_timestamp()+interval '10 minutes')",
    [digest(setup), credentialId],
  );
  await signupEmail(
    db.pool,
    f.provider,
    {
      email: f.email,
      password: "Synthetic-password-123!",
      displayName: "Must not overwrite original",
      birthDate: null,
      requestKey: secret(),
    },
    randomUUID(),
    setup,
  );
  await confirmEmail(db.pool, f.provider, f.token, randomUUID());
  expect(
    (
      await db.pool.query(
        "select person_id from mhistree.accounts where provider_subject=$1",
        [f.subject],
      )
    ).rows[0].person_id,
  ).toBe(personId);
  expect(
    (
      await db.pool.query(
        "select display_name from mhistree.persons where id=$1",
        [personId],
      )
    ).rows[0].display_name,
  ).toBe("Synthetic Staff Patient");
});
it("reset retires app sessions, rejects replay and pre-reset callback tokens", async () => {
  const f = fixture();
  await enroll(f);
  const signed = await loginEmail(
    db.pool,
    f.provider,
    f.email,
    "Synthetic-password-123!",
    randomUUID(),
  );
  await resetEmailPassword(
    db.pool,
    f.provider,
    f.token,
    "New-synthetic-password-456!",
    randomUUID(),
  );
  expect(f.updates).toBe(1);
  await expect(
    transaction((tx) => verifySession(tx, signed.session), db.pool),
  ).rejects.toThrow("SESSION_RETIRED");
  await expect(
    resetEmailPassword(
      db.pool,
      f.provider,
      f.token,
      "New-synthetic-password-456!",
      randomUUID(),
    ),
  ).rejects.toThrow("TOKEN_INVALID");
  await expect(
    confirmEmail(db.pool, f.provider, f.token, randomUUID()),
  ).rejects.toThrow("SESSION_RETIRED");
});
it("password-authenticated proofs cannot reset by email; primary login contact cannot be removed", async () => {
  const f = fixture();
  await enroll(f);
  const signed = await loginEmail(
    db.pool,
    f.provider,
    f.email,
    "Synthetic-password-123!",
    randomUUID(),
  );
  f.proof.methods = ["password"];
  await expect(
    resetEmailPassword(
      db.pool,
      f.provider,
      f.token,
      "New-synthetic-password-456!",
      randomUUID(),
    ),
  ).rejects.toThrow("AUTH_REQUIRED");
  const contact = (
    await db.pool.query(
      "select c.id from mhistree.contacts c join mhistree.accounts a on a.person_id=c.person_id where a.provider_subject=$1",
      [f.subject],
    )
  ).rows[0];
  await expect(
    removeContact(db.pool, signed.session, contact.id),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("provider failure during reset denies old sessions and remains explicitly retryable", async () => {
  const f = fixture();
  await enroll(f);
  const signed = await loginEmail(
    db.pool,
    f.provider,
    f.email,
    "Synthetic-password-123!",
    randomUUID(),
  );
  f.provider.updatePassword = async () => {
    throw new Error("SYNTHETIC_PROVIDER_OUTAGE");
  };
  await expect(
    resetEmailPassword(
      db.pool,
      f.provider,
      f.token,
      "New-synthetic-password-456!",
      randomUUID(),
    ),
  ).rejects.toThrow("SYNTHETIC_PROVIDER_OUTAGE");
  await expect(
    transaction((tx) => verifySession(tx, signed.session), db.pool),
  ).rejects.toThrow("SESSION_RETIRED");
  expect(
    (
      await db.pool.query(
        "select status from mhistree.accounts where provider_subject=$1",
        [f.subject],
      )
    ).rows[0].status,
  ).toBe("recovery-pending");
});

it.runIf(process.env.MHISTREE_LIVE_AUTH_TEST === "1")(
  "real Supabase password login/reset and old-password rejection (synthetic user, no outbound email)",
  async () => {
    const env = Object.fromEntries(
      (await readFile(".env", "utf8")).split(/\r?\n/).flatMap((line) => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        return match
          ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]]
          : [];
      }),
    );
    const url = env.NEXT_PUBLIC_SUPABASE_URL,
      key =
        env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serverKey = env.SUPABASE_SERVICE_ROLE_KEY;
    expect(new URL(url).hostname).toBe("wcsizaumvthtkilrqsjr.supabase.co");
    const admin = createClient(url, serverKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = `mhistree-integration-${randomUUID()}@example.com`,
      password = `Synthetic-${randomUUID()}!`,
      newPassword = `Synthetic-New-${randomUUID()}!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error || !created.data.user)
      throw new Error("Synthetic Supabase user creation failed");
    const subject = created.data.user.id;
    Object.assign(process.env, env, {
      DATABASE_URL: `postgresql://${db.pool.options.user}:${encodeURIComponent(String(db.pool.options.password))}@127.0.0.1:${db.pool.options.port}/${db.pool.options.database}`,
      DATABASE_SSL: "local",
      APP_ORIGIN: "http://127.0.0.1:3101",
    });
    const post = async (
      operation: string,
      input: unknown,
      requestOrigin = "http://127.0.0.1:3101",
    ) =>
      POST(
        new NextRequest(`http://127.0.0.1:3101/api/auth/${operation}`, {
          method: "POST",
          headers: {
            origin: requestOrigin,
            "content-type": "application/json",
          },
          body: JSON.stringify(input),
        }),
        { params: Promise.resolve({ operation }) },
      );
    try {
      const provider = new SupabaseProvider(url, key, serverKey);
      await db.pool.query(
        "insert into mhistree.email_enrollments(request_digest,provider_subject,email,display_name) values($1,$2,$3,'Synthetic Live Auth')",
        [digest(secret()), subject, email],
      );
      expect(
        (
          await post(
            "login",
            { identifier: email, password },
            "https://unrelated.example",
          )
        ).status,
      ).toBe(403);
      const loggedIn = await post("login", { identifier: email, password });
      expect(loggedIn.status).toBe(200);
      expect(loggedIn.headers.get("set-cookie")).toContain("HttpOnly");
      expect(loggedIn.headers.get("set-cookie")).toContain("SameSite=strict");
      const session = {
        session: loggedIn.cookies.get("mhistree-session")!.value,
      };
      const link = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (link.error)
        throw new Error("Synthetic recovery proof generation failed");
      const recovered = await provider.publicClient.auth.verifyOtp({
        token_hash: link.data.properties.hashed_token,
        type: "recovery",
      });
      if (recovered.error || !recovered.data.session)
        throw new Error("Synthetic recovery proof verification failed");
      const signed = { token: recovered.data.session.access_token };
      expect(
        (
          await post("reset-password", {
            token: signed.token,
            password: newPassword,
          })
        ).status,
      ).toBe(200);
      await expect(
        transaction((tx) => verifySession(tx, session.session), db.pool),
      ).rejects.toThrow("SESSION_RETIRED");
      await expect(provider.signIn(email, password)).rejects.toThrow(
        "AUTH_REQUIRED",
      );
      const updated = await provider.signIn(email, newPassword);
      expect(updated.claims.subject).toBe(subject);
      const { error } = await admin.auth.admin.signOut(updated.token, "global");
      expect(error).toBeNull();
    } finally {
      await database().end();
      const { error } = await admin.auth.admin.deleteUser(subject);
      if (error) throw new Error("Synthetic Supabase test-user cleanup failed");
    }
  },
  60000,
);
