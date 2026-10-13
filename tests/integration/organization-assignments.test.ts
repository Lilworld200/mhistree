import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  inviteStaff,
  respondInvitation,
  updateMembership,
} from "@/features/organizations/membership";
import {
  connectOrganization,
  assignPatient,
  assignedPatients,
} from "@/features/organizations/assignments";
import { withAccess, authorize } from "@/features/access/server";
import { patientConnections } from "@/features/access/patient-controls";
import { initiateDirectConnection } from "@/features/practitioner/patients";
let db: Awaited<ReturnType<typeof testDatabase>>;
let admin: Awaited<ReturnType<typeof staffFixture>>,
  staff: typeof admin,
  patient: typeof admin;
let org: string, connectionId: string, assignmentId: string, direct: string;
const grants = [
  "records.read",
  "records.write",
  "consent.manage",
  "assignments.manage",
];
beforeAll(async () => {
  db = await testDatabase();
  admin = await staffFixture(db.pool, []);
  staff = await staffFixture(db.pool, []);
  patient = await staffFixture(db.pool, []);
  org = (
    await db.pool.query(
      "insert into mhistree.organizations(status,display_name) values('approved','Synthetic org') returning id",
    )
  ).rows[0].id;
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{organization.manage}')",
    [org, admin.accountId],
  );
});
afterAll(async () => {
  await db?.stop();
});
it("invitation requires intended account acceptance; assignment cannot exceed consent exclusions", async () => {
  const invite = await inviteStaff(db.pool, admin.session, {
    organizationId: org,
    accountId: staff.accountId,
    privileges: grants,
  });
  await expect(
    respondInvitation(db.pool, patient.session, {
      id: invite.id,
      accept: true,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await respondInvitation(db.pool, staff.session, {
    id: invite.id,
    accept: true,
  });
  await expect(
    respondInvitation(db.pool, staff.session, { id: invite.id, accept: true }),
  ).rejects.toThrow("ACCESS_DENIED");
  connectionId = (
    await connectOrganization(db.pool, staff.session, {
      organizationId: org,
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "allergy"],
      exclusions: ["allergy"],
      evidence: "Synthetic identity and consent verification",
    })
  ).id;
  expect(
    (await patientConnections(db.pool, patient.session)).connections[0].kind,
  ).toBe("organization");
  await expect(
    assignPatient(db.pool, staff.session, {
      organizationId: org,
      connectionId,
      accountId: staff.accountId,
      categories: ["allergy"],
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  assignmentId = (
    await assignPatient(db.pool, staff.session, {
      organizationId: org,
      connectionId,
      accountId: staff.accountId,
      categories: ["clinical"],
    })
  ).id;
  expect(await assignedPatients(db.pool, staff.session)).toHaveLength(1);
});
it("current context denies cross-organization, excluded categories and administrative clinical access; removal preserves direct care", async () => {
  const context = {
    kind: "organization" as const,
    organizationId: org,
    connectionId,
    assignmentId,
  };
  const resource = {
    patientPersonId: patient.personId,
    originPersonId: patient.personId,
    category: "clinical",
    visibility: "finalized" as const,
    authorAccountId: staff.accountId,
    originalContext: `organization:${connectionId}`,
    originalOrganizationId: org,
  };
  await withAccess(db.pool, staff.session, context, (a) =>
    authorize(a, resource, "read"),
  );
  await expect(
    withAccess(db.pool, admin.session, context, (a) =>
      authorize(a, resource, "write"),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    withAccess(
      db.pool,
      staff.session,
      { ...context, organizationId: randomUUID() },
      (a) => authorize(a, resource, "read"),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    withAccess(db.pool, staff.session, context, (a) =>
      authorize(a, { ...resource, category: "allergy" }, "read"),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  direct = (
    await initiateDirectConnection(db.pool, staff.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical"],
      exclusions: [],
      evidence: "Synthetic separate direct consent evidence",
    })
  ).id;
  await updateMembership(db.pool, admin.session, {
    organizationId: org,
    accountId: staff.accountId,
    version: 1,
    active: false,
    privileges: [],
  });
  await expect(
    withAccess(db.pool, staff.session, context, (a) =>
      authorize(a, resource, "read"),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await withAccess(
    db.pool,
    staff.session,
    { kind: "direct", connectionId: direct },
    (a) => authorize(a, resource, "read"),
  );
  expect(await assignedPatients(db.pool, staff.session)).toHaveLength(0);
});
