import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { assignedPatientCards } from "@/features/practitioner/patient-overview";
import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { createConversation, sendMessage } from "@/features/ai-chat/server";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import {
  directPatientCards,
  patientOverviewInAccess,
} from "@/features/practitioner/patient-overview";
import { directWorkspace } from "@/features/practitioner/workspace";
import { withAccess, revokeConnection } from "@/features/access/server";
import { setPatientConsent } from "@/features/access/patient-controls";
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  patient: typeof doctor,
  other: typeof doctor,
  connection: string;
beforeAll(async () => {
  db = await testDatabase();
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      method: "in-person",
      requestKey: randomUUID(),
      categories: [
        "symptom",
        "activity",
        "medication-use",
        "prescription",
        "result",
        "allergy",
      ],
      exclusions: ["allergy"],
      evidence: "Synthetic identity and sharing consent confirmed.",
    })
  ).id;
});
afterAll(async () => {
  await db?.stop();
});
async function report(
  cat: string,
  text: string,
  medication?: unknown,
  chat = false,
) {
  let messageId: string | undefined;
  if (chat) {
    const conversation = randomUUID();
    await createConversation(db.pool, patient.session, conversation);
    messageId = (
      await sendMessage(db.pool, patient.session, {
        conversationId: conversation,
        requestKey: randomUUID(),
        content: text + " PRIVATE unrelated source detail",
        timezone: "Africa/Lagos",
      })
    ).messageId;
  }
  const source = await recordSource(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      patientPersonId: patient.personId,
      category: cat,
      content: text + (chat ? " PRIVATE unrelated source detail" : ""),
      clientKey: randomUUID(),
      sourceTimezone: "Africa/Lagos",
      ...(messageId ? { messageId } : {}),
    },
  );
  return acceptContribution(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      sourceId: source.sourceId,
      sourceVersion: 1,
      sourceItemId: randomUUID(),
      operationKey: randomUUID(),
      body: { text, ...(medication ? { medication } : {}) },
      status: "active",
      occurredAt: { precision: "unknown" },
      sourceSpans: [text],
    },
  );
}
const med = (useStatus: string, plannedEnd: string | null = null) => ({
  useStatus,
  plannedStart: null,
  plannedEnd,
  actualStart: null,
  actualEnd: null,
});
it("shows only today's permitted chat reports and separates reported taking from stopped, unknown and planned-ended use", async () => {
  await report(
    "allergy",
    "Excluded allergy information should never be in a preview",
    undefined,
    true,
  );
  await report(
    "symptom",
    "Had a headache after a long workday",
    undefined,
    true,
  );
  await report("medication-use", "Taking Synthetic medicine A", med("taking"));
  await report(
    "medication-use",
    "Stopped Synthetic medicine B",
    med("stopped"),
  );
  await report(
    "medication-use",
    "Past planned Synthetic medicine C",
    med("taking", "2020-01-01"),
  );
  await report(
    "medication-use",
    "Unknown use Synthetic medicine D",
    med("unknown"),
  );
  const preview = (await directPatientCards(db.pool, doctor.session))[0]
    .overview!;
  expect(preview.summaryKind).toBe("today");
  expect(JSON.stringify(preview)).toContain("headache after a long workday");
  expect(JSON.stringify(preview)).not.toContain("Excluded allergy");
  expect(JSON.stringify(preview)).not.toContain("PRIVATE unrelated");
  expect(preview.medications).toHaveLength(1);
  expect(preview.medications[0].text).toContain("medicine A");
  expect(preview.prescriptions).toHaveLength(0);
});
it("uses an overview when there are no shared chat reports on that Lagos date, without treating old reports as today's events", async () => {
  const future = new Date(Date.now() + 2 * 86400000);
  const preview = await withAccess(
    db.pool,
    doctor.session,
    { kind: "direct", connectionId: connection },
    (a) => patientOverviewInAccess(a, patient.personId, future),
  );
  expect(preview.summaryKind).toBe("overview");
  expect(preview.summary.length).toBeGreaterThan(0);
  expect(preview.summary[0].recordedAt).not.toBe(future.toISOString());
});
it("returns the current patient identity, read permissions, recent prescriptions and finalized results without granting another clinician access", async () => {
  const context = { kind: "direct" as const, connectionId: connection };
  for (const category of ["prescription", "result"]) {
    const source = await recordSource(db.pool, doctor.session, context, {
      patientPersonId: patient.personId,
      category,
      content: `Synthetic finalized ${category}`,
      clientKey: randomUUID(),
      sourceTimezone: "Africa/Lagos",
    });
    await acceptContribution(db.pool, doctor.session, context, {
      sourceId: source.sourceId,
      sourceVersion: 1,
      sourceItemId: category,
      operationKey: randomUUID(),
      body: { text: `Synthetic finalized ${category}` },
      status: "unknown",
      occurredAt: { precision: "unknown" },
      sourceSpans: [`Synthetic finalized ${category}`],
    });
  }
  const workspace = await directWorkspace(db.pool, doctor.session, connection);
  expect(workspace.patient.display_name).toBe("Synthetic reviewer");
  expect(workspace.permissions.read).toContain("medication-use");
  expect(workspace.permissions.read).not.toContain("allergy");
  expect(workspace.overview.prescriptions).toHaveLength(1);
  expect(workspace.overview.results).toHaveLength(1);
  expect(workspace.overview.medications).toHaveLength(1);
  const before = (
    await db.pool.query("select count(*) n from mhistree.contributions")
  ).rows[0].n;
  const answer = await practitionerAssistance(
    db.pool,
    doctor.session,
    {
      connectionId: connection,
      question: "Summarize the reported headache and medication use",
      purpose: "question",
      includeOwnNotes: false,
    },
    {
      generate: async (system) => {
        expect(system).not.toContain("Excluded allergy");
        expect(system).not.toContain("PRIVATE unrelated");
        return JSON.stringify({
          text: "Synthetic local test response only",
          evidenceIds: [],
          limitations: ["Controlled adapter; not a live provider result"],
        });
      },
    },
  );
  expect(answer.text).toContain("Synthetic local test");
  expect(
    (await db.pool.query("select count(*) n from mhistree.contributions"))
      .rows[0].n,
  ).toBe(before);
  await expect(
    directWorkspace(db.pool, other.session, connection),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("pending requests have no preview; narrowing and revocation remove medication and other clinical content", async () => {
  const incoming = await staffFixture(db.pool);
  await initiateDirectConnection(db.pool, doctor.session, {
    patientPersonId: incoming.personId,
    method: "login",
    requestKey: randomUUID(),
    categories: ["symptom"],
    exclusions: [],
  });
  const pending = (await directPatientCards(db.pool, doctor.session)).find(
    (r) => r.patient_person_id === incoming.personId,
  )!;
  expect(pending.overview).toBeNull();
  const before = await directWorkspace(db.pool, doctor.session, connection);
  await setPatientConsent(db.pool, patient.session, {
    connectionId: connection,
    version: before.revision,
    mode: "narrow",
    categories: ["symptom"],
    exclusions: ["allergy"],
  });
  const narrowed = (await directPatientCards(db.pool, doctor.session)).find(
    (r) => r.id === connection,
  )!.overview!;
  expect(narrowed.medications).toHaveLength(0);
  expect(narrowed.prescriptions).toHaveLength(0);
  expect(narrowed.results).toHaveLength(0);
  await revokeConnection(db.pool, patient.session, connection);
  expect(
    (await directPatientCards(db.pool, doctor.session)).find(
      (r) => r.id === connection,
    )!.overview,
  ).toBeNull();
  await expect(
    directWorkspace(db.pool, doctor.session, connection),
  ).rejects.toThrow("ACCESS_DENIED");
});

it("organization previews remain within their assignment scope and independent of a revoked direct connection", async () => {
  const org = randomUUID(),
    orgConnection = randomUUID(),
    assignment = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status,display_name) values($1,'approved','Synthetic overview organization')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,records.write}')",
    [org, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.connections(id,patient_person_id,kind,organization_id,status) values($1,$2,'organization',$3,'active')",
    [orgConnection, patient.personId, org],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom,medication-use}',$2,'{*}','login',$3)",
    [orgConnection, [patient.personId], patient.accountId],
  );
  await db.pool.query(
    "insert into mhistree.assignments(id,organization_id,patient_person_id,account_id,categories,active) values($1,$2,$3,$4,'{symptom}',true)",
    [assignment, org, patient.personId, doctor.accountId],
  );
  const rows = await assignedPatientCards(db.pool, doctor.session);
  expect(rows).toHaveLength(1);
  expect(rows[0].overview!.summary[0].text).toContain("headache");
  expect(rows[0].overview!.medications).toHaveLength(0);
  expect(rows[0].overview!.historyCounts?.map((c) => c.category)).toEqual([
    "symptom",
  ]);
});
