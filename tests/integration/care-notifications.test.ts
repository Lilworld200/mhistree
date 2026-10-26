import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { sendCareMessage } from "@/features/messaging/server";
import { practitionerNotifications } from "@/features/practitioner/notifications";
import { directWorkspace } from "@/features/practitioner/workspace";
import { markThreadRead } from "@/features/practitioner/daily";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function fixture() {
  const doctor = await staffFixture(db.pool),
    patient = await staffFixture(db.pool),
    other = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.professionals set privileges=privileges||'{messages.send}'::text[] where account_id=$1",
    [doctor.accountId],
  );
  const connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["symptom"],
      exclusions: [],
      evidence: "Synthetic identity check and explicit consent",
    })
  ).id;
  return { doctor, patient, other, connection };
}
it("incoming care message flags the same patient across navigation/Health/inbox, without reading notifications or private AI chat", async () => {
  const { doctor, patient, other, connection } = await fixture();
  const input = {
    connectionId: connection,
    requestKey: randomUUID(),
    content: "PATIENT_REVIEWED_CONTACT_REQUEST",
  };
  await sendCareMessage(db.pool, patient.session, { kind: "patient" }, input);
  await sendCareMessage(db.pool, patient.session, { kind: "patient" }, input);
  const snapshot = await practitionerNotifications(db.pool, doctor.session);
  expect(snapshot.connections).toEqual([
    { connectionId: connection, unread: 1 },
  ]);
  expect(JSON.stringify(snapshot)).not.toContain(input.content);
  expect(
    (await practitionerNotifications(db.pool, other.session)).connections,
  ).toEqual([]);
  const workspace = await directWorkspace(
    db.pool,
    doctor.session,
    connection,
    "profile",
  );
  expect(workspace.notifications).toEqual({
    health: true,
    messages: true,
    ai: false,
  });
  expect(workspace.handoverSummary).toBeNull();
  expect(
    (
      await db.pool.query(
        "select has_table_privilege('mhistree_runtime','mhistree.notifications','SELECT') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});
it("acknowledges only displayed sequences, keeps concurrent arrivals unread and excludes the clinician's own replies", async () => {
  const { doctor, patient, connection } = await fixture();
  const send = (content: string, session = patient.session) =>
    sendCareMessage(
      db.pool,
      session,
      {
        kind: session === patient.session ? "patient" : "direct",
        ...(session === patient.session ? {} : { connectionId: connection }),
      } as { kind: "patient" } | { kind: "direct"; connectionId: string },
      { connectionId: connection, requestKey: randomUUID(), content },
    );
  const first = await send("First care request");
  const sequence = (
    await db.pool.query(
      "select sequence::text from mhistree.care_messages where id=$1",
      [first.id],
    )
  ).rows[0].sequence;
  const second = await send("New arrival while practitioner is reading");
  await markThreadRead(
    db.pool,
    doctor.session,
    connection,
    undefined,
    sequence,
  );
  expect(
    (await practitionerNotifications(db.pool, doctor.session)).connections,
  ).toEqual([{ connectionId: connection, unread: 1 }]);
  const last = (
    await db.pool.query(
      "select sequence::text from mhistree.care_messages where id=$1",
      [second.id],
    )
  ).rows[0].sequence;
  await markThreadRead(db.pool, doctor.session, connection, undefined, last);
  await send("Clinician reply", doctor.session);
  expect(
    (await practitionerNotifications(db.pool, doctor.session)).connections,
  ).toEqual([]);
  expect(
    (await directWorkspace(db.pool, doctor.session, connection, "profile"))
      .notifications.messages,
  ).toBe(false);
  expect(
    (await db.pool.query("select count(*)::int n from mhistree.contributions"))
      .rows[0].n,
  ).toBe(0);
});
it("revocation and privilege removal clear badges and forbid other actors' acknowledgements", async () => {
  const { doctor, patient, other, connection } = await fixture();
  await sendCareMessage(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      connectionId: connection,
      requestKey: randomUUID(),
      content: "Contact request",
    },
  );
  await expect(
    markThreadRead(db.pool, other.session, connection),
  ).rejects.toThrow("ACCESS_DENIED");
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read}' where account_id=$1",
    [doctor.accountId],
  );
  expect(
    (await practitionerNotifications(db.pool, doctor.session)).connections,
  ).toEqual([]);
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read,messages.send}' where account_id=$1",
    [doctor.accountId],
  );
  await db.pool.query(
    "update mhistree.connections set status='revoked',revision=revision+1 where id=$1",
    [connection],
  );
  expect(
    (await practitionerNotifications(db.pool, doctor.session)).connections,
  ).toEqual([]);
  await expect(
    markThreadRead(db.pool, doctor.session, connection),
  ).rejects.toThrow("ACCESS_DENIED");
});
