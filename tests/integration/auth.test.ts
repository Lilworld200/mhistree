import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { registerPerson } from "@/features/identity/server";
import {
  issueCredential,
  redeemCredential,
  completeSetup,
  signIn,
  signOut,
} from "@/features/auth/server";
import { verifySession, digest } from "@/features/auth/sessions";
import { transaction } from "@/lib/db/client";
import { KeycloakProvider, type ProviderConfig } from "@/lib/auth/keycloak";

describe("T08 actual Keycloak and PostgreSQL", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    staff: Awaited<ReturnType<typeof staffFixture>>,
    provider: KeycloakProvider;
  let patient: { personId: string; alias: string },
    loginIdentifier: string,
    oldSession: string;
  let config: ProviderConfig;
  const password = `Synthetic-${randomUUID()}!`;
  const key = () => randomUUID();
  beforeAll(async () => {
    config = JSON.parse(await readFile(".local/auth-config.json", "utf8"));
    provider = new KeycloakProvider(config);
    db = await testDatabase();
    staff = await staffFixture(db.pool);
    patient = await registerPerson(db.pool, staff.session, staff.contextId, {
      displayName: "Synthetic Contactless",
    });
  });
  afterAll(async () => {
    await db?.stop();
  });
  const issue = (purpose: "activation" | "recovery" = "activation") =>
    issueCredential(db.pool, db.lockPool, provider, staff.session, {
      personId: patient.personId,
      purpose,
      contextId: staff.contextId,
      evidenceReference: "synthetic-identity-check",
    });
  it("replaces invitation; concurrent redemption has one winner and grants setup only", async () => {
    const first = await issue();
    const second = await issue();
    await expect(redeemCredential(db.pool, first.code, key())).rejects.toThrow(
      "TOKEN_INVALID",
    );
    const results = await Promise.allSettled([
      redeemCredential(db.pool, second.code, key()),
      redeemCredential(db.pool, second.code, key()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ setupSession: string }>;
    await expect(
      transaction(
        (tx) => verifySession(tx, winner.value.setupSession),
        db.pool,
      ),
    ).rejects.toThrow("SESSION_RETIRED");
    const result = await completeSetup(
      db.pool,
      db.lockPool,
      provider,
      winner.value.setupSession,
      password,
      key(),
    );
    loginIdentifier = result.loginIdentifier;
    await expect(
      completeSetup(
        db.pool,
        db.lockPool,
        provider,
        winner.value.setupSession,
        password,
        key(),
      ),
    ).rejects.toThrow("TOKEN_INVALID");
    const login = await signIn(
      db.pool,
      provider,
      loginIdentifier,
      password,
      key(),
    );
    oldSession = login.session;
    expect(
      (await transaction((tx) => verifySession(tx, oldSession), db.pool))
        .personId,
    ).toBe(patient.personId);
    const { rows } = await db.pool.query(
      `select (select count(*)::int from mhistree.contacts where person_id=$1) contacts,(select count(*)::int from mhistree.accounts where person_id=$1) accounts`,
      [patient.personId],
    );
    expect(rows[0]).toEqual({ contacts: 0, accounts: 1 });
    await expect(
      signIn(db.pool, provider, patient.alias, password, key()),
    ).rejects.toThrow("AUTH_REQUIRED");
  });
  it("supports a separately verified optional email without making it mandatory", async () => {
    const tokenResponse = await fetch(
      `${config.baseUrl}/realms/${config.realm}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      },
    );
    expect(tokenResponse.ok).toBe(true);
    const token = await tokenResponse.json();
    const account = (
      await db.pool.query(
        "select provider_subject from mhistree.accounts where person_id=$1",
        [patient.personId],
      )
    ).rows[0];
    const email = `synthetic-${randomUUID()}@example.invalid`;
    // Synthetic fixture asserts verification; real verification belongs to T10.
    const update = await fetch(
      `${config.baseUrl}/admin/realms/${config.realm}/users/${account.provider_subject}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, emailVerified: true }),
      },
    );
    expect(update.ok).toBe(true);
    await expect(
      signIn(db.pool, provider, email, password, key()),
    ).rejects.toThrow("AUTH_REQUIRED");
    await db.pool.query(
      "insert into mhistree.contacts(person_id,kind,address,verified_at) values($1,'email',$2,clock_timestamp())",
      [patient.personId, email],
    );
    const login = await signIn(db.pool, provider, email, password, key());
    expect(
      (await transaction((tx) => verifySession(tx, login.session), db.pool))
        .personId,
    ).toBe(patient.personId);
  });
  it("recovery immediately retires old sessions and old passwords fail after patient setup", async () => {
    const unavailable = new KeycloakProvider({
      ...config,
      baseUrl: "http://127.0.0.1:1",
    });
    const pending = await issueCredential(
      db.pool,
      db.lockPool,
      unavailable,
      staff.session,
      {
        personId: patient.personId,
        purpose: "recovery",
        contextId: staff.contextId,
        evidenceReference: "synthetic-outage-check",
      },
    );
    expect(pending.providerRevocationPending).toBe(true);
    await expect(
      transaction((tx) => verifySession(tx, oldSession), db.pool),
    ).rejects.toThrow("SESSION_RETIRED");
    const recovery = await issue("recovery");
    expect(recovery.providerRevocationPending).toBe(false);
    await expect(
      transaction((tx) => verifySession(tx, oldSession), db.pool),
    ).rejects.toThrow("SESSION_RETIRED");
    await expect(
      signIn(db.pool, provider, loginIdentifier, password, key()),
    ).rejects.toThrow("AUTH_REQUIRED");
    const setup = await redeemCredential(db.pool, recovery.code, key());
    const nextPassword = `New-${randomUUID()}!`;
    await completeSetup(
      db.pool,
      db.lockPool,
      provider,
      setup.setupSession,
      nextPassword,
      key(),
    );
    await expect(
      signIn(db.pool, provider, loginIdentifier, password, key()),
    ).rejects.toThrow("AUTH_REQUIRED");
    const login = await signIn(
      db.pool,
      provider,
      loginIdentifier,
      nextPassword,
      key(),
    );
    await signOut(db.pool, login.session);
    await expect(
      transaction((tx) => verifySession(tx, login.session), db.pool),
    ).rejects.toThrow("SESSION_RETIRED");
  });
  it("expired/replayed credentials fail, hashes only persist, staff cannot supply passwords", async () => {
    const recovery = await issue("recovery");
    await db.pool.query(
      `update mhistree.setup_credentials set expires_at=clock_timestamp()-interval '1 second' where digest=$1`,
      [digest(recovery.code)],
    );
    await expect(
      redeemCredential(db.pool, recovery.code, key()),
    ).rejects.toThrow("TOKEN_INVALID");
    const persisted = JSON.stringify(
      (await db.pool.query("select * from mhistree.setup_credentials")).rows,
    );
    expect(persisted).not.toContain(recovery.code);
    expect(persisted).not.toContain(password);
    await expect(
      issueCredential(db.pool, db.lockPool, provider, staff.session, {
        personId: patient.personId,
        purpose: "recovery",
        contextId: staff.contextId,
        evidenceReference: "synthetic-check",
        password,
      }),
    ).rejects.toThrow();
    const ordinary = await staffFixture(db.pool, ["person.lookup"]);
    await expect(
      issueCredential(db.pool, db.lockPool, provider, ordinary.session, {
        personId: patient.personId,
        purpose: "recovery",
        contextId: ordinary.contextId,
        evidenceReference: "synthetic-check",
      }),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("recovers a provider-success/database-failure without another identity or login", async () => {
    const fresh = await registerPerson(
      db.pool,
      staff.session,
      staff.contextId,
      { displayName: "Synthetic retry patient" },
    );
    const issued = await issueCredential(
      db.pool,
      db.lockPool,
      provider,
      staff.session,
      {
        personId: fresh.personId,
        purpose: "activation",
        contextId: staff.contextId,
        evidenceReference: "synthetic-retry-check",
      },
    );
    const setup = await redeemCredential(db.pool, issued.code, key());
    await db.pool.query(
      "create function mhistree.synthetic_auth_fail() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_AUTH_COMMIT_FAILURE';end;$$;create trigger synthetic_auth_fail before insert on mhistree.accounts for each row execute function mhistree.synthetic_auth_fail()",
    );
    await expect(
      completeSetup(
        db.pool,
        db.lockPool,
        provider,
        setup.setupSession,
        password,
        key(),
      ),
    ).rejects.toThrow("SYNTHETIC_AUTH_COMMIT_FAILURE");
    const before = (
      await db.pool.query(
        "select provider_subject from mhistree.auth_enrollments where person_id=$1",
        [fresh.personId],
      )
    ).rows[0].provider_subject;
    expect(before).toBeTruthy();
    await db.pool.query(
      "drop trigger synthetic_auth_fail on mhistree.accounts",
    );
    const completed = await completeSetup(
      db.pool,
      db.lockPool,
      provider,
      setup.setupSession,
      password,
      key(),
    );
    const account = (
      await db.pool.query(
        "select provider_subject from mhistree.accounts where person_id=$1",
        [fresh.personId],
      )
    ).rows;
    expect(account).toHaveLength(1);
    expect(account[0].provider_subject).toBe(before);
    const signed = await provider.signIn(completed.loginIdentifier, password);
    await expect(
      new KeycloakProvider({ ...config, clientId: "wrong-client" }).verify(
        signed.token,
      ),
    ).rejects.toThrow("AUTH_REQUIRED");
    await expect(
      new KeycloakProvider({ ...config, realm: "master" }).verify(signed.token),
    ).rejects.toThrow("AUTH_REQUIRED");
  });
  it("enforces attempts and rejects tampered provider JWTs", async () => {
    for (let i = 0; i < 5; i++)
      await expect(
        redeemCredential(db.pool, "invalid-code", "same-network"),
      ).rejects.toThrow("TOKEN_INVALID");
    await expect(
      redeemCredential(db.pool, "invalid-code", "same-network"),
    ).rejects.toThrow("RATE_LIMITED");
    await expect(provider.verify("made-up.jwt.value")).rejects.toThrow(
      "AUTH_REQUIRED",
    );
  });
});
