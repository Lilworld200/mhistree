import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  searchPractitioners,
  connectPractitioner,
  patientAccessHistory,
} from "@/features/access/sharing";
import { patientConnections } from "@/features/access/patient-controls";
import {
  revokeConnection,
  withAccess,
  authorize,
} from "@/features/access/server";
let db: Awaited<ReturnType<typeof testDatabase>>,
  patient: Awaited<ReturnType<typeof staffFixture>>,
  doctor: typeof patient,
  other: typeof patient;
let connection: string;
const confirmation = {
  practitionerId: "",
  requestKey: randomUUID(),
  categories: ["allergy"],
  exclusions: [],
};
beforeAll(async () => {
  db = await testDatabase();
  patient = await staffFixture(db.pool);
  doctor = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.persons set display_name='Synthetic Doctor' where id=$1",
    [doctor.personId],
  );
  await db.pool.query(
    "update mhistree.persons set display_name='Unapproved Doctor' where id=$1",
    [other.personId],
  );
  await db.pool.query(
    "update mhistree.professionals set status='pending' where account_id=$1",
    [other.accountId],
  );
  confirmation.practitionerId = doctor.accountId;
});
afterAll(async () => {
  await db?.stop();
});
it("search exposes approved professional display data only, excluding self and unapproved profiles", async () => {
  const result = await searchPractitioners(db.pool, patient.session, {
    query: "Doctor",
  });
  expect(result.items).toHaveLength(1);
  expect(result.items[0].id).toBe(doctor.accountId);
  expect(Object.keys(result.items[0]).sort()).toEqual(
    ["id", "display_name", "profession", "jurisdiction"].sort(),
  );
  expect(
    (await searchPractitioners(db.pool, doctor.session, { query: "Doctor" }))
      .items,
  ).toHaveLength(0);
  expect(
    (await patientConnections(db.pool, patient.session)).connections,
  ).toHaveLength(0);
  await expect(
    searchPractitioners(db.pool, "bad-session", { query: "Doctor" }),
  ).rejects.toThrow();
});
it("patient confirmation creates scoped consent atomically and concurrent retry creates one connection", async () => {
  const results = await Promise.all([
    connectPractitioner(db.pool, patient.session, confirmation),
    connectPractitioner(db.pool, patient.session, confirmation),
  ]);
  connection = results[0].id;
  expect(results[1].id).toBe(connection);
  const rows = (await patientConnections(db.pool, patient.session)).connections;
  expect(rows).toHaveLength(1);
  expect(rows[0].status).toBe("active");
  expect(rows[0].categories).toEqual(["allergy"]);
  const resource = {
    patientPersonId: patient.personId,
    originPersonId: patient.personId,
    category: "allergy",
    visibility: "finalized" as const,
    authorAccountId: patient.accountId,
    originalContext: `patient:${patient.accountId}`,
    originalOrganizationId: null,
  };
  await withAccess(
    db.pool,
    doctor.session,
    { kind: "direct", connectionId: connection },
    (a) => authorize(a, resource, "read"),
  );
  await expect(
    withAccess(
      db.pool,
      doctor.session,
      { kind: "direct", connectionId: connection },
      (a) => authorize(a, { ...resource, category: "clinical" }, "read"),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    connectPractitioner(db.pool, patient.session, {
      ...confirmation,
      requestKey: randomUUID(),
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("cannot connect self or an unapproved practitioner; failed confirmation leaves no connection", async () => {
  for (const practitionerId of [patient.accountId, other.accountId])
    await expect(
      connectPractitioner(db.pool, patient.session, {
        ...confirmation,
        practitionerId,
        requestKey: randomUUID(),
      }),
    ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await patientConnections(db.pool, patient.session)).connections,
  ).toHaveLength(1);
});
it("history shows meaningful actors, supports exact timestamp pagination, filters connections and denies other patients", async () => {
  await db.pool.query(
    `insert into mhistree.audit_events(actor_account_id,person_id,action,context_id,recorded_at)
    select $1,$2,'record.read',$3,'2026-10-22 12:00:00.123456+00'::timestamptz from generate_series(1,35)`,
    [doctor.accountId, patient.personId, `direct:${connection}`],
  );
  const first = await patientAccessHistory(db.pool, patient.session, {
    connectionId: connection,
  });
  expect(first.items).toHaveLength(30);
  expect(
    first.items.some((event) => event.actor_name === "Synthetic Doctor"),
  ).toBe(true);
  expect(first.nextCursor).not.toBeNull();
  const second = await patientAccessHistory(db.pool, patient.session, {
    connectionId: connection,
    before: first.nextCursor,
  });
  const combined = [...first.items, ...second.items];
  expect(combined).toHaveLength(36);
  expect(new Set(combined.map((e) => e.id)).size).toBe(36);
  expect(JSON.stringify(combined)).not.toContain(doctor.accountId);
  await expect(
    patientAccessHistory(db.pool, other.session, { connectionId: connection }),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await patientAccessHistory(db.pool, other.session, {})).items,
  ).toHaveLength(0);
});
it("replaying a confirmation after revocation never restores consent", async () => {
  await revokeConnection(db.pool, patient.session, connection);
  await connectPractitioner(db.pool, patient.session, confirmation);
  expect(
    (await patientConnections(db.pool, patient.session)).connections[0].status,
  ).toBe("revoked");
});
