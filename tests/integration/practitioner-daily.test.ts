import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import {
  practitionerToday,
  saveAvailability,
  removeAvailability,
} from "@/features/practitioner/daily";
import { requestAppointment } from "@/features/appointments/server";
import { sendCareMessage } from "@/features/messaging/server";
import { saveWork } from "@/features/clinical-care/work";
import { revokeConnection } from "@/features/access/server";
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  patient: typeof doctor,
  other: typeof doctor,
  connection: string;
const startsAt = new Date(Date.now() + 86400000).toISOString(),
  endsAt = new Date(Date.now() + 90000000).toISOString();
beforeAll(async () => {
  db = await testDatabase();
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.professionals set privileges=privileges||'{appointments.manage,messages.send,requests.read}'::text[] where account_id=$1",
    [doctor.accountId],
  );
  connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "document", "result"],
      exclusions: [],
      evidence: "Synthetic identity check and explicit consent.",
    })
  ).id;
  await requestAppointment(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      connectionId: connection,
      practitionerId: doctor.accountId,
      requestKey: randomUUID(),
      slot: { startsAt, endsAt, timezone: "UTC" },
    },
  );
  await sendCareMessage(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      connectionId: connection,
      requestKey: randomUUID(),
      content: "Synthetic care message",
    },
  );
  await saveWork(
    db.pool,
    doctor.session,
    { kind: "direct", connectionId: connection },
    {
      patientPersonId: patient.personId,
      kind: "reminder",
      category: "clinical",
      body: { text: "Synthetic private reminder" },
      occurredAt: { precision: "unknown" },
      timezone: "UTC",
      dueAt: null,
      requestKey: randomUUID(),
    },
  );
});
afterAll(async () => {
  await db?.stop();
});
it("daily projection includes current direct appointments/unread/author reminders and excludes unrelated accounts", async () => {
  const result = await practitionerToday(db.pool, doctor.session);
  expect(result.items).toHaveLength(1);
  expect(result.items[0].appointments).toHaveLength(1);
  expect(result.items[0].unread).toBe(1);
  expect(result.items[0].reminders[0].body.text).toBe(
    "Synthetic private reminder",
  );
  expect((await practitionerToday(db.pool, other.session)).items).toHaveLength(
    0,
  );
});
it("availability uses real overlap, capability and optimistic-version guards", async () => {
  const slot = await saveAvailability(db.pool, doctor.session, {
    startsAt,
    endsAt,
    timezone: "UTC",
  });
  await expect(
    saveAvailability(db.pool, doctor.session, {
      startsAt,
      endsAt,
      timezone: "UTC",
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await expect(
    saveAvailability(db.pool, other.session, {
      startsAt,
      endsAt,
      timezone: "UTC",
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    removeAvailability(db.pool, doctor.session, { id: slot.id, version: 99 }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await removeAvailability(db.pool, doctor.session, {
    id: slot.id,
    version: 1,
  });
  expect(
    (await practitionerToday(db.pool, doctor.session)).availability,
  ).toHaveLength(0);
});
it("revocation removes dependent work from daily projections and professional suspension denies the whole projection", async () => {
  await revokeConnection(db.pool, patient.session, connection);
  expect((await practitionerToday(db.pool, doctor.session)).items).toHaveLength(
    0,
  );
  await db.pool.query(
    "update mhistree.professionals set status='suspended' where account_id=$1",
    [doctor.accountId],
  );
  await expect(practitionerToday(db.pool, doctor.session)).rejects.toThrow(
    "ACCESS_DENIED",
  );
});
