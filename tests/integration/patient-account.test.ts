import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import {
  beginRegistration,
  accountProfile,
  updateProfile,
  addContact,
  removeContact,
} from "@/features/patient/account/server";
import { completeSetup, signIn, signOut } from "@/features/auth/server";
import { KeycloakProvider } from "@/lib/auth/keycloak";
import { secret } from "@/features/auth/sessions";
import { mutationGuard, jsonBody } from "@/lib/http";
describe("patient entry on the real foundation", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    provider: KeycloakProvider,
    session: string,
    identifier: string;
  const password = `Synthetic-${randomUUID()}!`;
  beforeAll(async () => {
    db = await testDatabase();
    provider = new KeycloakProvider(
      JSON.parse(await readFile(".local/auth-config.json", "utf8")),
    );
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("concurrent self-registration makes one person, no contacts; provider login survives profile reads", async () => {
    const input = {
      displayName: "Synthetic Patient Entry",
      requestKey: secret(),
    };
    const setups = await Promise.all([
      beginRegistration(db.pool, input, randomUUID()),
      beginRegistration(db.pool, input, randomUUID()),
    ]);
    expect(
      Number(
        (await db.pool.query("select count(*) from mhistree.persons")).rows[0]
          .count,
      ),
    ).toBe(1);
    const ready = await completeSetup(
      db.pool,
      provider,
      setups[0].setupSession,
      password,
      randomUUID(),
    );
    identifier = ready.loginIdentifier;
    session = (
      await signIn(db.pool, provider, identifier, password, randomUUID())
    ).session;
    expect((await accountProfile(db.pool, session)).contacts).toHaveLength(0);
    expect((await accountProfile(db.pool, session)).display_name).toBe(
      input.displayName,
    );
    await expect(
      beginRegistration(db.pool, input, randomUUID()),
    ).rejects.toThrow("TOKEN_INVALID");
  });
  it("profile version conflicts preserve values, contacts cannot self-verify or transfer ownership", async () => {
    await updateProfile(db.pool, session, {
      displayName: "Patient Updated",
      birthDate: null,
      version: 1,
    });
    await expect(
      updateProfile(db.pool, session, { displayName: "Lost edit", version: 1 }),
    ).rejects.toThrow("VERSION_CONFLICT");
    await expect(
      addContact(db.pool, session, {
        kind: "email",
        address: "synthetic@example.test",
        verified_at: new Date().toISOString(),
      }),
    ).rejects.toThrow();
    await addContact(db.pool, session, {
      kind: "email",
      address: "synthetic@example.test",
    });
    const profile = await accountProfile(db.pool, session);
    expect(profile.contacts[0].verified_at).toBeNull();
    expect(profile.login_identifier).toBe(identifier);
    await removeContact(db.pool, session, profile.contacts[0].id);
    expect((await accountProfile(db.pool, session)).contacts).toHaveLength(0);
  });
  it("logout denies the same session and reauthentication works", async () => {
    await signOut(db.pool, session);
    await expect(accountProfile(db.pool, session)).rejects.toThrow(
      "SESSION_RETIRED",
    );
    session = (
      await signIn(db.pool, provider, identifier, password, randomUUID())
    ).session;
    expect((await accountProfile(db.pool, session)).display_name).toBe(
      "Patient Updated",
    );
  });
  it("transport refuses cross-origin, absent-origin and oversized requests", async () => {
    process.env.APP_ORIGIN = "http://127.0.0.1:3101";
    const request = (origin: string) =>
      new Request("http://127.0.0.1:3101/api/auth/login", {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: "{}",
      });
    expect(() => mutationGuard(request("https://evil.example"))).toThrow(
      "ACCESS_DENIED",
    );
    expect(() => mutationGuard(request(""))).toThrow("ACCESS_DENIED");
    expect(() => mutationGuard(request("http://127.0.0.1:3101"))).not.toThrow();
    await expect(
      jsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: "x".repeat(100),
        }),
        10,
      ),
    ).rejects.toThrow("ACCESS_DENIED");
  });
});
