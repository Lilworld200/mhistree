import { beforeAll, afterAll, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { KeycloakProvider } from "@/lib/auth/keycloak";
import { registerOrganizationPatient } from "@/features/organizations/care";
import {
  assistedCredential,
  designateRecovery,
  identitySupportQueue,
  escalateIdentity,
} from "@/features/identity/assistance";
import {
  redeemCredential,
  completeSetup,
  signIn,
} from "@/features/auth/server";
import { verifySession } from "@/features/auth/sessions";
import { transaction } from "@/lib/db/client";
let db: Awaited<ReturnType<typeof testDatabase>>, provider: KeycloakProvider;
beforeAll(async () => {
  db = await testDatabase();
  provider = new KeycloakProvider(
    JSON.parse(await readFile(".local/auth-config.json", "utf8")),
  );
});
afterAll(async () => {
  await db?.stop();
});
it("designated staff recover a no-contact patient; ordinary staff cannot recover and prior sessions fail", async () => {
  const staff = await staffFixture(db.pool),
    reviewer = await staffFixture(db.pool),
    org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{person.register,person.lookup,auth.activate}')",
    [org, staff.accountId],
  );
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,organization_id,privileges,evidence_reference) values($1,$2,$3,'{person.register,person.lookup,auth.activate}','Synthetic staff privileges')",
    [staff.accountId, `organization:${org}`, org],
  );
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,'review:identity','{identity.review}','Synthetic designated identity reviewer')",
    [reviewer.accountId],
  );
  const person = await registerOrganizationPatient(db.pool, staff.session, {
    organizationId: org,
    person: { displayName: "Synthetic recovery patient" },
  });
  const input = {
    organizationId: org,
    personId: person.personId,
    purpose: "activation",
    verificationMethod: "In-person document check",
    evidenceReference: "Synthetic restricted identity evidence",
  };
  const first = await assistedCredential(
      db.pool,
      provider,
      staff.session,
      input,
    ),
    second = await assistedCredential(db.pool, provider, staff.session, input);
  await expect(
    redeemCredential(db.pool, first.code, randomUUID()),
  ).rejects.toThrow("TOKEN_INVALID");
  const setup = await redeemCredential(db.pool, second.code, randomUUID()),
    password = `Synthetic-${randomUUID()}!`;
  const account = await completeSetup(
    db.pool,
    provider,
    setup.setupSession,
    password,
    randomUUID(),
  );
  const login = await signIn(
    db.pool,
    provider,
    account.loginIdentifier,
    password,
    randomUUID(),
  );
  await expect(
    assistedCredential(db.pool, provider, staff.session, {
      ...input,
      purpose: "recovery",
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await designateRecovery(db.pool, reviewer.session, {
    organizationId: org,
    accountId: staff.accountId,
    active: true,
    evidence: "Synthetic independent recovery staff designation",
  });
  const recovery = await assistedCredential(db.pool, provider, staff.session, {
    ...input,
    purpose: "recovery",
  });
  await expect(
    transaction((tx) => verifySession(tx, login.session), db.pool),
  ).rejects.toThrow();
  const restricted = await redeemCredential(
    db.pool,
    recovery.code,
    randomUUID(),
  );
  await completeSetup(
    db.pool,
    provider,
    restricted.setupSession,
    `Synthetic-${randomUUID()}!`,
    randomUUID(),
  );
  await expect(
    redeemCredential(db.pool, recovery.code, randomUUID()),
  ).rejects.toThrow("TOKEN_INVALID");
  await escalateIdentity(db.pool, staff.session, {
    organizationId: org,
    personId: person.personId,
    evidence: "Synthetic uncertainty requiring support review",
  });
  await expect(identitySupportQueue(db.pool, staff.session)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  expect(await identitySupportQueue(db.pool, reviewer.session)).toHaveLength(1);
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.contacts where person_id=$1",
        [person.personId],
      )
    ).rows[0].n,
  ).toBe("0");
});
