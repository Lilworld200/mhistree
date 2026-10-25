import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  initiateDirectConnection,
  respondDirectConnection,
} from "@/features/practitioner/patients";
import { saveWork, listWork, editWork } from "@/features/clinical-care/work";
import { revokeConnection } from "@/features/access/server";
import { setPatientConsent } from "@/features/access/patient-controls";
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  other: Awaited<ReturnType<typeof staffFixture>>,
  patient: Awaited<ReturnType<typeof staffFixture>>,
  connection: string,
  id: string;
beforeAll(async () => {
  db = await testDatabase();
  doctor = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical"],
      exclusions: [],
      evidence: "Synthetic identity and scope confirmed in person.",
    })
  ).id;
});
afterAll(async () => {
  await db?.stop();
});
it("author private notes and drafts stay out of patient/other practitioner access", async () => {
  const draft = await saveWork(
    db.pool,
    doctor.session,
    { kind: "direct", connectionId: connection },
    {
      requestKey: randomUUID(),
      patientPersonId: patient.personId,
      kind: "draft",
      category: "clinical",
      body: {
        text: "Suspected finding, not confirmed",
        bodySite: null,
        contextLinks: [],
      },
      occurredAt: { precision: "unknown" },
      timezone: "Africa/Lagos",
    },
  );
  id = draft.id;
  expect(
    (
      await listWork(db.pool, doctor.session, {
        kind: "direct",
        connectionId: connection,
      })
    ).length,
  ).toBe(1);
  expect(await listWork(db.pool, patient.session, { kind: "patient" })).toEqual(
    [],
  );
  expect(
    await listWork(db.pool, other.session, {
      kind: "direct",
      connectionId: connection,
    }),
  ).toEqual([]);
  expect(
    (await db.pool.query("select count(*) n from mhistree.contributions"))
      .rows[0].n,
  ).toBe("0");
});
it("revocation blocks author; reconnection leaves draft paused until explicit reviewed resume", async () => {
  await revokeConnection(db.pool, patient.session, connection);
  expect(
    await listWork(db.pool, doctor.session, {
      kind: "direct",
      connectionId: connection,
    }),
  ).toEqual([]);
  await expect(
    editWork(
      db.pool,
      doctor.session,
      { kind: "direct", connectionId: connection },
      { id, version: 2, action: "resume", reason: "Reviewed current context" },
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  const revision = (
    await db.pool.query(
      "select revision from mhistree.connections where id=$1",
      [connection],
    )
  ).rows[0].revision;
  const restored = await setPatientConsent(db.pool, patient.session, {
    connectionId: connection,
    version: revision,
    mode: "reconnect",
    categories: ["clinical"],
    exclusions: [],
  });
  expect(
    await listWork(db.pool, doctor.session, {
      kind: "direct",
      connectionId: connection,
    }),
  ).toEqual([]);
  await respondDirectConnection(db.pool, doctor.session, {
    id: connection,
    version: restored.version,
    action: "approve",
  });
  const work = (
    await listWork(db.pool, doctor.session, {
      kind: "direct",
      connectionId: connection,
    })
  )[0];
  expect(work.state).toBe("paused");
  await expect(
    editWork(
      db.pool,
      doctor.session,
      { kind: "direct", connectionId: connection },
      { id, version: work.version, action: "edit", body: work.body },
    ),
  ).rejects.toThrow("VERSION_CONFLICT");
  expect(
    (
      await editWork(
        db.pool,
        doctor.session,
        { kind: "direct", connectionId: connection },
        {
          id,
          version: work.version,
          action: "resume",
          reason: "Reviewed original dates and restored consent.",
        },
      )
    ).state,
  ).toBe("draft");
});
