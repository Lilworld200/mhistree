import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  registerOrganizationPatient,
  establishInitialCare,
  organizationWorkspace,
} from "@/features/organizations/care";
import { saveWork } from "@/features/clinical-care/work";
import { finalizeEntry } from "@/features/clinical-care/entries";
import { withAccess, authorize } from "@/features/access/server";
import {
  connectOrganization,
  assignPatient,
  assignedPatients,
} from "@/features/organizations/assignments";
import {
  createServiceRequest,
  changeServiceRequest,
  publishResult,
} from "@/features/clinical-care/requests";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
it("no-contact patient receives attributed initial care through the shared atomic finalization service", async () => {
  const doctor = await staffFixture(db.pool),
    org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{person.register,records.read,records.write}')",
    [org, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,organization_id,privileges,evidence_reference) values($1,$2,$3,'{person.register}','Synthetic org registration')",
    [doctor.accountId, `organization:${org}`, org],
  );
  const patient = await registerOrganizationPatient(db.pool, doctor.session, {
    organizationId: org,
    person: { displayName: "Synthetic no-contact patient" },
  });
  const context = await establishInitialCare(db.pool, doctor.session, {
    organizationId: org,
    patientPersonId: patient.personId,
    categories: ["clinical"],
    evidence: "Synthetic authorized registration care basis",
  });
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.accounts where person_id=$1",
        [patient.personId],
      )
    ).rows[0].n,
  ).toBe("0");
  const draft = await saveWork(db.pool, doctor.session, context, {
    requestKey: randomUUID(),
    patientPersonId: patient.personId,
    kind: "draft",
    category: "clinical",
    body: {
      text: "Synthetic initial clinical care",
      bodySite: null,
      contextLinks: [],
    },
    occurredAt: { precision: "unknown" },
    timezone: "Africa/Lagos",
  });
  const input = {
    id: draft.id,
    version: 1,
    requestKey: randomUUID(),
    reviewed: true,
    status: "unknown",
  };
  const result = await finalizeEntry(db.pool, doctor.session, context, input);
  expect(
    (await finalizeEntry(db.pool, doctor.session, context, input)).eventId,
  ).toBe(result.eventId);
  const workspace = await organizationWorkspace(
    db.pool,
    doctor.session,
    context,
  );
  expect(workspace.recent).toHaveLength(1);
  expect(workspace.recent[0].author_account_id).toBe(doctor.accountId);
  expect(workspace.recent[0].original_organization_id).toBe(org);
  await expect(
    withAccess(db.pool, doctor.session, context, (a) =>
      authorize(
        a,
        {
          patientPersonId: patient.personId,
          originPersonId: patient.personId,
          category: "clinical",
          visibility: "finalized",
          authorAccountId: doctor.accountId,
          originalContext: "another-provider",
          originalOrganizationId: org,
        },
        "read",
      ),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await assignedPatients(db.pool, doctor.session)).some(
      (row) => row.basis_id === context.basisId,
    ),
  ).toBe(true);
  const activatedSurvivor = await staffFixture(db.pool);
  // Isolate the policy projection; merge.test.ts exercises the journaled mapping operation.
  await db.pool.query(
    "update mhistree.persons set canonical_person_id=$2 where id=$1",
    [patient.personId, activatedSurvivor.personId],
  );
  expect(
    (await assignedPatients(db.pool, doctor.session)).some(
      (row) => row.basis_id === context.basisId,
    ),
  ).toBe(false);
  await expect(
    organizationWorkspace(db.pool, doctor.session, context),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    establishInitialCare(db.pool, doctor.session, {
      organizationId: org,
      patientPersonId: patient.personId,
      categories: ["clinical"],
      evidence: "Synthetic attempted renewed initial care after identity merge",
    }),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("organization recipient publishes only within result assignment and retains the signed-in human contributor", async () => {
  const staff = await staffFixture(db.pool),
    patient = await staffFixture(db.pool),
    org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "update mhistree.professionals set privileges=privileges||'{requests.read,requests.create,results.finalize}' where account_id=$1",
    [staff.accountId],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{consent.manage,assignments.manage,records.read,records.write,requests.read,requests.create,results.finalize}')",
    [org, staff.accountId],
  );
  const connection = (
    await connectOrganization(db.pool, staff.session, {
      organizationId: org,
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "result"],
      exclusions: [],
      evidence: "Synthetic organizational care and result consent",
    })
  ).id;
  const assignment = (
    await assignPatient(db.pool, staff.session, {
      organizationId: org,
      connectionId: connection,
      accountId: staff.accountId,
      categories: ["result"],
    })
  ).id;
  const context = {
    kind: "organization" as const,
    organizationId: org,
    connectionId: connection,
    assignmentId: assignment,
  };
  let request = await createServiceRequest(db.pool, staff.session, context, {
    patientPersonId: patient.personId,
    recipientConnectionId: connection,
    recipientAccountId: staff.accountId,
    serviceName: "Synthetic organizational test",
    priority: "routine",
    requestedFor: null,
    authorizationBasis: "Explicit organization consent and result assignment",
    requestKey: randomUUID(),
  });
  for (const action of ["accepted", "in-progress", "performed"])
    request = await changeServiceRequest(db.pool, staff.session, context, {
      id: request.id,
      version: request.version,
      action,
    });
  const work = await saveWork(db.pool, staff.session, context, {
    requestKey: randomUUID(),
    patientPersonId: patient.personId,
    kind: "draft",
    category: "result",
    body: {
      text: "Synthetic organization result",
      bodySite: null,
      contextLinks: [],
    },
    occurredAt: { precision: "unknown" },
    timezone: "Africa/Lagos",
  });
  request = await changeServiceRequest(db.pool, staff.session, context, {
    id: request.id,
    version: request.version,
    action: "result-draft",
    workId: work.id,
  });
  const result = await publishResult(db.pool, staff.session, context, {
    requestId: request.id,
    version: request.version,
    entry: {
      id: work.id,
      version: 1,
      reviewed: true,
      status: "unknown",
      requestKey: randomUUID(),
    },
  });
  const event = (
    await db.pool.query(
      "select author_account_id,original_organization_id from mhistree.contributions where id=$1",
      [result.eventId],
    )
  ).rows[0];
  expect(event.author_account_id).toBe(staff.accountId);
  expect(event.original_organization_id).toBe(org);
});
