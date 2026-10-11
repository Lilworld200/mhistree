import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  requestAppointment,
  changeAppointment,
  listAppointments,
} from "@/features/appointments/server";
import { sendCareMessage, careMessages } from "@/features/messaging/server";
import { revokeConnection } from "@/features/access/server";
import { setPatientConsent } from "@/features/access/patient-controls";
import { patientRequests } from "@/features/patient/care/server";
describe("shared durable patient care services", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    other: Awaited<ReturnType<typeof staffFixture>>,
    doctor: Awaited<ReturnType<typeof staffFixture>>;
  const connection = randomUUID(),
    otherConnection = randomUUID();
  let appointment: string;
  const start = new Date(Date.now() + 86400000 * 5),
    end = new Date(start.getTime() + 1800000);
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
    doctor = await staffFixture(db.pool);
    await db.pool.query(
      "update mhistree.professionals set privileges=privileges||'{appointments.manage,messages.send,requests.read}'::text[] where account_id=$1",
      [doctor.accountId],
    );
    for (const [id, person] of [
      [connection, patient.personId],
      [otherConnection, other.personId],
    ]) {
      await db.pool.query(
        "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'active')",
        [id, person, doctor.accountId],
      );
      await db.pool.query(
        "insert into mhistree.consents(connection_id,categories,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{clinical,allergy}',$2,'{*}','login',$3)",
        [id, [person], patient.accountId],
      );
    }
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("concurrent overlapping requests serialize; patient cannot accept; provider can reschedule and accept", async () => {
    const slot = {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      timezone: "Africa/Lagos",
    };
    const results = await Promise.allSettled([
      requestAppointment(
        db.pool,
        patient.session,
        { kind: "patient" },
        {
          connectionId: connection,
          practitionerId: doctor.accountId,
          requestKey: randomUUID(),
          slot,
        },
      ),
      requestAppointment(
        db.pool,
        other.session,
        { kind: "patient" },
        {
          connectionId: otherConnection,
          practitionerId: doctor.accountId,
          requestKey: randomUUID(),
          slot,
        },
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const winner = results.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<{ id: string; connection_id: string }>;
    appointment = winner.value.id;
    const owner = winner.value.connection_id === connection ? patient : other;
    await expect(
      changeAppointment(
        db.pool,
        doctor.session,
        { kind: "direct", connectionId: winner.value.connection_id },
        { id: appointment, version: 1, action: "accept", slot },
      ),
    ).rejects.toThrow("Only rescheduling");
    await expect(
      changeAppointment(
        db.pool,
        owner.session,
        { kind: "patient" },
        { id: appointment, version: 1, action: "accept" },
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    await changeAppointment(
      db.pool,
      doctor.session,
      { kind: "direct", connectionId: winner.value.connection_id },
      { id: appointment, version: 1, action: "accept" },
    );
    const moved = await changeAppointment(
      db.pool,
      owner.session,
      { kind: "patient" },
      {
        id: appointment,
        version: 2,
        action: "reschedule",
        slot: {
          ...slot,
          startsAt: new Date(start.getTime() + 3600000).toISOString(),
          endsAt: new Date(end.getTime() + 3600000).toISOString(),
        },
      },
    );
    expect(moved.state).toBe("requested");
    await expect(
      changeAppointment(
        db.pool,
        owner.session,
        { kind: "patient" },
        { id: appointment, version: 2, action: "cancel" },
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
  });
  it("patient/provider text persists once and unrelated patients cannot read it", async () => {
    const input = {
      connectionId: connection,
      requestKey: randomUUID(),
      content: "Synthetic appointment question",
    };
    const results = await Promise.all([
      sendCareMessage(db.pool, patient.session, { kind: "patient" }, input),
      sendCareMessage(db.pool, patient.session, { kind: "patient" }, input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    await sendCareMessage(
      db.pool,
      doctor.session,
      { kind: "direct", connectionId: connection },
      {
        connectionId: connection,
        requestKey: randomUUID(),
        content: "Synthetic provider response",
      },
    );
    expect(
      (
        await careMessages(
          db.pool,
          patient.session,
          { kind: "patient" },
          connection,
        )
      ).items,
    ).toHaveLength(2);
    await expect(
      careMessages(db.pool, other.session, { kind: "patient" }, connection),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("revocation pauses pending care; reconnection does not resume appointments or requests", async () => {
    await db.pool.query(
      "insert into mhistree.service_requests(connection_id,patient_person_id,service_name,state,fixture) values($1,$2,'Synthetic test','requested',true)",
      [connection, patient.personId],
    );
    await revokeConnection(db.pool, patient.session, connection);
    await expect(
      sendCareMessage(
        db.pool,
        doctor.session,
        { kind: "direct", connectionId: connection },
        {
          connectionId: connection,
          requestKey: randomUUID(),
          content: "Must be denied",
        },
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    expect((await patientRequests(db.pool, patient.session))[0].state).toBe(
      "paused",
    );
    await setPatientConsent(db.pool, patient.session, {
      connectionId: connection,
      version: 2,
      mode: "reconnect",
      categories: ["clinical"],
      exclusions: [],
    });
    expect((await patientRequests(db.pool, patient.session))[0].state).toBe(
      "paused",
    );
    const appointments = await listAppointments(db.pool, patient.session);
    expect(appointments.every((a) => a.state === "paused")).toBe(true);
  });
});
