import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  patientConnections,
  setPatientConsent,
} from "@/features/access/patient-controls";
import { revokeConnection } from "@/features/access/server";
import {
  recordSource,
  acceptContribution,
  readContribution,
} from "@/features/health-records/server";
import { requestReview } from "@/features/health-records/corrections";
import { exportPage } from "@/features/patient/account/export";
describe("patient-owned consent and controls", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    doctor: Awaited<ReturnType<typeof staffFixture>>,
    other: Awaited<ReturnType<typeof staffFixture>>;
  const direct = randomUUID(),
    org = randomUUID(),
    orgConnection = randomUUID();
  let event: string;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    doctor = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
    await db.pool.query(
      "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'pending')",
      [direct, patient.personId, doctor.accountId],
    );
    await db.pool.query(
      "insert into mhistree.organizations(id,status,display_name) values($1,'approved','Synthetic Organization')",
      [org],
    );
    await db.pool.query(
      "insert into mhistree.connections(id,patient_person_id,kind,organization_id,status) values($1,$2,'organization',$3,'pending')",
      [orgConnection, patient.personId, org],
    );
    const source = await recordSource(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        patientPersonId: patient.personId,
        category: "allergy",
        sourceTimezone: "UTC",
        content: "Synthetic allergy report",
        clientKey: randomUUID(),
      },
    );
    event = (
      await acceptContribution(
        db.pool,
        patient.session,
        { kind: "patient" },
        {
          sourceId: source.sourceId,
          sourceVersion: 1,
          sourceItemId: "allergy",
          operationKey: randomUUID(),
          body: { text: "Synthetic allergy" },
          occurredAt: { precision: "unknown" },
          status: "unknown",
          sourceSpans: ["Synthetic allergy"],
        },
      )
    ).eventId;
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("approval, narrowing, independent revocation and reconnection preserve paused work", async () => {
    await setPatientConsent(db.pool, patient.session, {
      connectionId: direct,
      version: 1,
      mode: "approve",
      categories: ["allergy", "ongoing"],
      exclusions: [],
    });
    await setPatientConsent(db.pool, patient.session, {
      connectionId: orgConnection,
      version: 1,
      mode: "approve",
      categories: ["allergy"],
      exclusions: [],
    });
    expect(
      (
        await readContribution(
          db.pool,
          doctor.session,
          { kind: "direct", connectionId: direct },
          event,
        )
      ).id,
    ).toBe(event);
    await setPatientConsent(db.pool, patient.session, {
      connectionId: direct,
      version: 2,
      mode: "narrow",
      categories: ["ongoing"],
      exclusions: [],
    });
    await expect(
      readContribution(
        db.pool,
        doctor.session,
        { kind: "direct", connectionId: direct },
        event,
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    await db.pool.query(
      "insert into mhistree.dependent_work(connection_id,state) values($1,'pending')",
      [orgConnection],
    );
    await revokeConnection(db.pool, patient.session, orgConnection);
    expect(
      (await patientConnections(db.pool, patient.session)).connections.find(
        (c) => c.id === direct,
      )?.status,
    ).toBe("active");
    await setPatientConsent(db.pool, patient.session, {
      connectionId: orgConnection,
      version: 3,
      mode: "reconnect",
      categories: ["allergy"],
      exclusions: [],
    });
    expect(
      (
        await db.pool.query(
          "select state from mhistree.dependent_work where connection_id=$1",
          [orgConnection],
        )
      ).rows[0].state,
    ).toBe("paused");
  });
  it("other patients cannot edit grants or export records; closure is only a review request", async () => {
    await expect(
      setPatientConsent(db.pool, other.session, {
        connectionId: direct,
        version: 3,
        mode: "narrow",
        categories: ["ongoing"],
        exclusions: [],
      }),
    ).rejects.toThrow("ACCESS_DENIED");
    expect((await exportPage(db.pool, patient.session)).items).toHaveLength(1);
    expect((await exportPage(db.pool, other.session)).items).toHaveLength(0);
    const result = await requestReview(db.pool, patient.session, {
      kind: "account-closure",
      eventId: null,
      reason: "Synthetic review request",
      requestKey: randomUUID(),
    });
    expect(result.state).toBe("submitted");
    expect(
      (
        await db.pool.query(
          "select status from mhistree.accounts where id=$1",
          [patient.accountId],
        )
      ).rows[0].status,
    ).toBe("active");
  });
});
