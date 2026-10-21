import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  defaultAccountPath,
  workspaceAccess,
} from "@/features/auth/workspace-access";
import { registerOrganization } from "@/features/organizations/server";
import { digest } from "@/features/auth/sessions";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
it("patient-only accounts have no professional or organization navigation", async () => {
  const patient = await staffFixture(db.pool);
  await db.pool.query(
    "delete from mhistree.professionals where account_id=$1",
    [patient.accountId],
  );
  expect(await defaultAccountPath(db.pool, patient.session)).toBe("/chat");
  expect(await workspaceAccess(db.pool, patient.session)).toEqual({
    practitioner: false,
    professionalProfile: false,
    organizations: false,
  });
});
it("current professional status controls workspace versus application navigation", async () => {
  const professional = await staffFixture(db.pool);
  expect(await defaultAccountPath(db.pool, professional.session)).toBe(
    "/clinician/dashboard",
  );
  expect(
    (await workspaceAccess(db.pool, professional.session)).practitioner,
  ).toBe(true);
  await db.pool.query(
    "update mhistree.professionals set status='suspended' where account_id=$1",
    [professional.accountId],
  );
  expect(await defaultAccountPath(db.pool, professional.session)).toBe("/chat");
  expect(await workspaceAccess(db.pool, professional.session)).toEqual({
    practitioner: false,
    professionalProfile: true,
    organizations: false,
  });
});
it("organization application is visible to its applicant without granting membership or clinical authority", async () => {
  const applicant = await staffFixture(db.pool),
    other = await staffFixture(db.pool);
  const org = await registerOrganization(db.pool, applicant.session, {
    legalName: "Synthetic Care Centre",
    registrationNumber: "TEST-42",
    jurisdiction: "Synthetic jurisdiction",
    address: "Synthetic test address",
    administratorCapacity: "Synthetic applicant authority for test",
    requestKey: randomUUID(),
  });
  expect(
    (await workspaceAccess(db.pool, applicant.session)).organizations,
  ).toBe(true);
  expect((await workspaceAccess(db.pool, other.session)).organizations).toBe(
    false,
  );
  expect(
    (
      await db.pool.query(
        "select 1 from mhistree.memberships where organization_id=$1",
        [org.id],
      )
    ).rowCount,
  ).toBe(0);
});
it("removed members lose organization navigation while an independent professional profile survives", async () => {
  const member = await staffFixture(db.pool),
    org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{}')",
    [org, member.accountId],
  );
  expect((await workspaceAccess(db.pool, member.session)).organizations).toBe(
    true,
  );
  await db.pool.query(
    "update mhistree.memberships set active=false where organization_id=$1",
    [org],
  );
  expect(await workspaceAccess(db.pool, member.session)).toEqual({
    practitioner: true,
    professionalProfile: true,
    organizations: false,
  });
});
it("a forged or retired session cannot request a workspace projection", async () => {
  const member = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.sessions set retired_at=clock_timestamp() where digest=$1",
    [digest(member.session)],
  );
  await expect(workspaceAccess(db.pool, member.session)).rejects.toThrow(
    "SESSION_RETIRED",
  );
  await expect(workspaceAccess(db.pool, "forged")).rejects.toThrow(
    "AUTH_REQUIRED",
  );
});
