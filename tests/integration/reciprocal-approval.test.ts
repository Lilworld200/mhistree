import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  connectionApprovalSettings,
  saveConnectionApprovalSettings,
} from "@/features/access/approval-settings";
import { connectPractitioner } from "@/features/access/sharing";
import {
  initiateDirectConnection,
  respondDirectConnection,
  directPatients,
} from "@/features/practitioner/patients";
import {
  patientConnections,
  setPatientConsent,
} from "@/features/access/patient-controls";
import {
  withAccess,
  authorize,
  revokeConnection,
} from "@/features/access/server";
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  patient: typeof doctor,
  other: typeof doctor;
const scope = { categories: ["allergy"], exclusions: [] };
beforeAll(async () => {
  db = await testDatabase();
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
});
afterAll(async () => {
  await db?.stop();
});
async function read(id: string, personId = patient.personId) {
  return withAccess(
    db.pool,
    doctor.session,
    { kind: "direct", connectionId: id },
    (a) =>
      authorize(
        a,
        {
          patientPersonId: personId,
          originPersonId: personId,
          category: "allergy",
          visibility: "finalized",
          authorAccountId: patient.accountId,
          originalContext: `patient:${patient.accountId}`,
          originalOrganizationId: null,
        },
        "read",
      ),
  );
}
it("defaults to manual approval and patient initiation cannot grant records before the practitioner approves", async () => {
  expect(
    (await connectionApprovalSettings(db.pool, patient.session, "patient"))
      .enabled,
  ).toBe(false);
  expect(
    (await connectionApprovalSettings(db.pool, doctor.session, "practitioner"))
      .enabled,
  ).toBe(false);
  const request = {
    practitionerId: doctor.accountId,
    requestKey: randomUUID(),
    ...scope,
  };
  const row = await connectPractitioner(db.pool, patient.session, request);
  await connectPractitioner(db.pool, patient.session, request);
  const pending = (await patientConnections(db.pool, patient.session))
    .connections[0];
  expect(pending.status).toBe("pending");
  await expect(read(row.id)).rejects.toThrow("ACCESS_DENIED");
  await expect(
    setPatientConsent(db.pool, patient.session, {
      connectionId: row.id,
      version: pending.revision,
      mode: "approve",
      ...scope,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await expect(
    respondDirectConnection(db.pool, other.session, {
      id: row.id,
      version: pending.revision,
      action: "approve",
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await respondDirectConnection(db.pool, doctor.session, {
    id: row.id,
    version: pending.revision,
    action: "approve",
  });
  await read(row.id);
  await expect(
    respondDirectConnection(db.pool, doctor.session, {
      id: row.id,
      version: pending.revision,
      action: "approve",
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("practitioner opt-in applies only to new incoming requests and does not activate an existing pending one", async () => {
  const next = await staffFixture(db.pool),
    later = await staffFixture(db.pool);
  const pending = await connectPractitioner(db.pool, next.session, {
    practitionerId: doctor.accountId,
    requestKey: randomUUID(),
    ...scope,
  });
  await saveConnectionApprovalSettings(db.pool, doctor.session, {
    role: "practitioner",
    enabled: true,
    version: 0,
  });
  expect(
    (await directPatients(db.pool, doctor.session)).find(
      (row) => row.id === pending.id,
    )?.status,
  ).toBe("pending");
  const accepted = await connectPractitioner(db.pool, later.session, {
    practitionerId: doctor.accountId,
    requestKey: randomUUID(),
    ...scope,
  });
  expect(
    (await directPatients(db.pool, doctor.session)).find(
      (row) => row.id === accepted.id,
    )?.status,
  ).toBe("active");
  await respondDirectConnection(db.pool, doctor.session, {
    id: pending.id,
    version: 2,
    action: "decline",
  });
  expect(
    (await directPatients(db.pool, doctor.session)).find(
      (row) => row.id === pending.id,
    )?.status,
  ).toBe("revoked");
});
it("turning automatic approval off preserves existing grants and new incoming requests wait", async () => {
  await saveConnectionApprovalSettings(db.pool, doctor.session, {
    role: "practitioner",
    enabled: false,
    version: 1,
  });
  expect(
    (await patientConnections(db.pool, patient.session)).connections[0].status,
  ).toBe("active");
  const newPatient = await staffFixture(db.pool);
  const pending = await connectPractitioner(db.pool, newPatient.session, {
    practitionerId: doctor.accountId,
    requestKey: randomUUID(),
    ...scope,
  });
  const row = (await directPatients(db.pool, doctor.session)).find(
    (row) => row.id === pending.id,
  )!;
  expect(row.status).toBe("pending");
  const outcomes = await Promise.allSettled([
    respondDirectConnection(db.pool, doctor.session, {
      id: pending.id,
      version: row.revision,
      action: "approve",
    }),
    respondDirectConnection(db.pool, doctor.session, {
      id: pending.id,
      version: row.revision,
      action: "approve",
    }),
  ]);
  expect(
    outcomes.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
});
it("patient opt-in requires exact active ID and bounded pre-approved scope, retaining original grant evidence", async () => {
  const target = await staffFixture(db.pool);
  const alias = `MH-${randomUUID()}`;
  await db.pool.query(
    "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values($1,$2,$2)",
    [alias, target.personId],
  );
  await saveConnectionApprovalSettings(db.pool, target.session, {
    role: "patient",
    enabled: true,
    categories: ["allergy"],
    version: 0,
  });
  const request = {
    patientPersonId: target.personId,
    exactAlias: alias,
    requestKey: randomUUID(),
    method: "login",
    ...scope,
  };
  const active = await initiateDirectConnection(
    db.pool,
    doctor.session,
    request,
  );
  expect(active.status).toBe("active");
  const consent = (
    await db.pool.query(
      "select responsible_account_id,evidence_reference,categories from mhistree.consents where connection_id=$1",
      [active.id],
    )
  ).rows[0];
  expect(consent.responsible_account_id).toBe(target.accountId);
  expect(consent.evidence_reference).toContain(
    `approval-settings:${target.accountId}:1`,
  );
  await revokeConnection(db.pool, target.session, active.id);
  const reconnect = await initiateDirectConnection(db.pool, doctor.session, {
    ...request,
    requestKey: randomUUID(),
  });
  expect(reconnect.status).toBe("pending");
  for (const variant of [
    { exactAlias: "MH-wrong", categories: ["allergy"] },
    { exactAlias: alias, categories: ["clinical"] },
  ]) {
    const anotherDoctor = await staffFixture(db.pool);
    const result = await initiateDirectConnection(
      db.pool,
      anotherDoctor.session,
      { ...request, ...variant, requestKey: randomUUID() },
    );
    expect(result.status).toBe("pending");
  }
});
it("manual incoming patient approval remains required when off; preference edits use versions and cannot self-grant professional eligibility", async () => {
  const target = await staffFixture(db.pool);
  const pending = await initiateDirectConnection(db.pool, doctor.session, {
    patientPersonId: target.personId,
    requestKey: randomUUID(),
    method: "login",
    ...scope,
  });
  expect(pending.status).toBe("pending");
  await setPatientConsent(db.pool, target.session, {
    connectionId: pending.id,
    version: 1,
    mode: "approve",
    ...scope,
  });
  expect(
    (await patientConnections(db.pool, target.session)).connections[0].status,
  ).toBe("active");
  await expect(
    saveConnectionApprovalSettings(db.pool, doctor.session, {
      role: "practitioner",
      enabled: false,
      version: 0,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await expect(
    saveConnectionApprovalSettings(db.pool, target.session, {
      role: "patient",
      enabled: true,
      version: 0,
      categories: [],
    }),
  ).rejects.toThrow("VALIDATION_FAILED");
  await db.pool.query(
    "update mhistree.professionals set status='pending' where account_id=$1",
    [target.accountId],
  );
  await expect(
    saveConnectionApprovalSettings(db.pool, target.session, {
      role: "practitioner",
      enabled: true,
      version: 0,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  const history = await db.pool.query(
    "select * from mhistree.connection_approval_setting_versions where account_id=$1",
    [doctor.accountId],
  );
  expect(history.rowCount).toBe(2);
});
