import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import { listWork } from "@/features/clinical-care/work";
import { healthState } from "@/features/health-records/current-state";
import { timeline } from "@/features/health-records/timeline";
import { revokeConnection } from "@/features/access/server";
import { setPatientConsent } from "@/features/access/patient-controls";
import {
  connectOrganization,
  assignPatient,
} from "@/features/organizations/assignments";
import { directWorkspace } from "@/features/practitioner/workspace";
import type { PractitionerProposal } from "@/features/clinical-care/ai-proposal";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function fixture(
  categories = [
    "clinical",
    "medication-use",
    "prescription",
    "allergy",
    "ongoing",
  ],
) {
  const doctor = await staffFixture(db.pool),
    patient = await staffFixture(db.pool);
  const connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories,
      exclusions: [],
      evidence:
        "Synthetic patient identity and explicit scope confirmed in person.",
    })
  ).id as string;
  return {
    doctor,
    patient,
    connection,
    context: { kind: "direct" as const, connectionId: connection },
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function proposal(category: PractitionerProposal["category"], text: string) {
  return {
    category,
    body: { text, bodySite: null, contextLinks: [] },
    occurredAt: { precision: "unknown" },
    status: "unknown",
    sourceSpans: [text],
    missingDetails: [],
    medicationDetails: null,
  };
}
async function suggest(
  f: Fixture,
  question: string,
  proposals: unknown[],
  previousRunId?: string,
) {
  return practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: f.connection,
      question,
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
      ...(previousRunId ? { previousRunId } : {}),
    },
    {
      generate: async () =>
        JSON.stringify({
          text: "Review the entry or keep it as a private note.",
          evidenceIds: [],
          limitations: [],
          proposals,
        }),
    },
  );
}
function input(
  run: { id: string; proposals: PractitionerProposal[] },
  destination: "record" | "note" = "record",
  index = 0,
) {
  const p = run.proposals[index];
  return {
    runId: run.id,
    itemId: p.id,
    destination,
    reviewed: true,
    text: p.body.text,
  };
}
it("clarifies incomplete medication across turns, then atomically saves one attributed timeline/Health entry with concurrent replay", async () => {
  const f = await fixture();
  const initial =
    "This patient is taking Omeprazole 20 milligrams once or twice daily.";
  const incomplete = {
    ...proposal("medication-use", initial),
    body: {
      text: initial,
      medication: {
        useStatus: "taking",
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
      },
    },
    medicationDetails: {
      name: "Omeprazole",
      dose: "20 milligrams",
      frequency: "once or twice daily",
    },
  };
  const first = await suggest(f, initial, [incomplete]);
  expect(first.proposals[0].missingDetails).toContain(
    "Clarify medication frequency.",
  );
  expect(
    (await timeline(db.pool, f.patient.session, { kind: "patient" })).items,
  ).toHaveLength(0);
  await expect(
    savePractitionerProposal(
      db.pool,
      f.doctor.session,
      f.context,
      input(first),
    ),
  ).rejects.toThrow("VALIDATION_FAILED");
  let sawEarlier = false;
  const text = "The patient is taking Omeprazole 20 milligrams once daily.";
  const run = await practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: f.connection,
      question: "Once daily is correct.",
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
      previousRunId: first.id,
    },
    {
      generate: async (_system, messages) => {
        sawEarlier = messages.some(
          (m) => m.role === "user" && m.content.includes(initial),
        );
        return JSON.stringify({
          text: "Save this to timeline and medications, or keep as a private note?",
          evidenceIds: [],
          limitations: [],
          proposals: [
            {
              ...incomplete,
              body: { ...incomplete.body, text },
              sourceSpans: [initial, "Once daily is correct."],
              medicationDetails: {
                name: "Omeprazole",
                dose: "20 milligrams",
                frequency: "daily",
              },
              missingDetails: [],
            },
          ],
        });
      },
    },
  );
  expect(sawEarlier).toBe(true);
  const results = await Promise.all([
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input(run)),
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input(run)),
  ]);
  expect(results[0]).toMatchObject({
    eventId: (results[1] as { eventId: string }).eventId,
  });
  const patientTimeline = await timeline(db.pool, f.patient.session, {
    kind: "patient",
  });
  expect(patientTimeline.items).toHaveLength(1);
  expect(patientTimeline.items[0]).toMatchObject({
    category: "medication-use",
    author_account_id: f.doctor.accountId,
    source_status: "professional-finalized",
    occurred_at: { precision: "unknown" },
  });
  const health = await healthState(db.pool, f.patient.session);
  expect(health.items[0].id).toBe(patientTimeline.items[0].id);
  expect(health.items[0].body.medication.useStatus).toBe("taking");
  expect(health.prescriptions).toHaveLength(0);
  expect(
    (await listWork(db.pool, f.doctor.session, f.context))[0].ai_provenance
      .runId,
  ).toBe(run.id);
});
it("keeps prescriptions, allergies and ongoing conditions distinct and exposes their finalized versions in Health", async () => {
  const f = await fixture();
  const rx = "I prescribed Omeprazole 20 mg once daily.";
  const allergy = "The patient has a confirmed penicillin allergy.";
  const ongoing = "The patient has suspected arthritis, awaiting confirmation.";
  const run = await suggest(f, `${rx} ${allergy} ${ongoing}`, [
    {
      ...proposal("prescription", rx),
      medicationDetails: {
        name: "Omeprazole",
        dose: "20 mg",
        frequency: "once daily",
      },
    },
    proposal("allergy", allergy),
    proposal("ongoing", ongoing),
  ]);
  for (let i = 0; i < 3; i++)
    await savePractitionerProposal(
      db.pool,
      f.doctor.session,
      f.context,
      input(run, "record", i),
    );
  const health = await healthState(db.pool, f.patient.session);
  expect(health.prescriptions).toHaveLength(1);
  expect(health.items.map((r) => r.category).sort()).toEqual([
    "allergy",
    "ongoing",
  ]);
  expect(
    health.items.find((r) => r.category === "ongoing")?.body.text,
  ).toContain("suspected");
  expect(
    (await timeline(db.pool, f.patient.session, { kind: "patient" })).items,
  ).toHaveLength(3);
});
it("the declined record choice saves an author-only note without changing patient history; destination cannot be replayed as publication", async () => {
  const f = await fixture();
  const text = "Patient reports an unidentified tablet; details unclear.";
  const run = await suggest(f, text, [
    {
      ...proposal("medication-use", text),
      missingDetails: ["Identify the tablet."],
      medicationDetails: { name: null, dose: null, frequency: null },
    },
  ]);
  const note = await savePractitionerProposal(
    db.pool,
    f.doctor.session,
    f.context,
    input(run, "note"),
  );
  expect(note.destination).toBe("note");
  const work = await listWork(db.pool, f.doctor.session, f.context);
  expect(work[0]).toMatchObject({
    kind: "private-note",
    author_account_id: f.doctor.accountId,
    ai_provenance: { runId: run.id },
  });
  expect(
    await listWork(db.pool, f.patient.session, { kind: "patient" }),
  ).toHaveLength(0);
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  expect(
    (await timeline(db.pool, f.patient.session, { kind: "patient" })).items,
  ).toHaveLength(0);
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input(run)),
  ).rejects.toThrow("VALIDATION_FAILED");
});
it("read-only, excluded categories, other actors/contexts and forged review/item IDs cannot write", async () => {
  const f = await fixture(["clinical"]),
    other = await fixture(["clinical"]);
  const text = "The patient reports fatigue.";
  const run = await suggest(f, text, [proposal("clinical", text)]);
  await expect(
    savePractitionerProposal(
      db.pool,
      other.doctor.session,
      f.context,
      input(run),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    savePractitionerProposal(
      db.pool,
      f.doctor.session,
      other.context,
      input(run),
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, f.context, {
      ...input(run),
      itemId: randomUUID(),
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, f.context, {
      ...input(run),
      reviewed: false,
    }),
  ).rejects.toThrow();
  await expect(suggest(f, text, [proposal("allergy", text)])).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read}' where account_id=$1",
    [f.doctor.accountId],
  );
  const read = await practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: f.connection,
      question: text,
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
    },
    {
      generate: async (system) => {
        expect(system).toContain("Current writable categories: []");
        return JSON.stringify({
          text: "You have read-only access.",
          evidenceIds: [],
          limitations: [],
          proposals: [],
        });
      },
    },
  );
  expect(read.proposals).toHaveLength(0);
  for (const destination of ["record", "note"] as const)
    await expect(
      savePractitionerProposal(
        db.pool,
        f.doctor.session,
        f.context,
        input(run, destination),
      ),
    ).rejects.toThrow("ACCESS_DENIED");
});
it("revocation during generation or before confirmation withholds output and cannot resume old work", async () => {
  const f = await fixture(),
    text = "The patient reports fatigue.";
  const run = await suggest(f, text, [proposal("clinical", text)]);
  await revokeConnection(db.pool, f.patient.session, f.connection);
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input(run)),
  ).rejects.toThrow("ACCESS_DENIED");
  const g = await fixture();
  await expect(
    practitionerAssistance(
      db.pool,
      g.doctor.session,
      {
        connectionId: g.connection,
        question: text,
        purpose: "question",
        includeOwnNotes: false,
        conversation: true,
      },
      {
        generate: async () => {
          await revokeConnection(db.pool, g.patient.session, g.connection);
          return JSON.stringify({
            text: "Withheld",
            evidenceIds: [],
            limitations: [],
            proposals: [proposal("clinical", text)],
          });
        },
      },
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await timeline(db.pool, g.patient.session, { kind: "patient" })).items,
  ).toHaveLength(0);
});
it("a failed persistent-state write rolls back draft, source, event and audit together and can retry safely", async () => {
  const f = await fixture(),
    text = "The patient has a latex allergy.";
  const run = await suggest(f, text, [proposal("allergy", text)]);
  await db.pool.query(
    "create function mhistree.fail_ai_entry_test() returns trigger language plpgsql as $$begin raise exception 'injected ai state failure';end;$$; create trigger fail_ai_entry_test before insert or update on mhistree.persistent_state for each row execute function mhistree.fail_ai_entry_test()",
  );
  try {
    await expect(
      savePractitionerProposal(
        db.pool,
        f.doctor.session,
        f.context,
        input(run),
      ),
    ).rejects.toThrow("injected ai state failure");
    expect(await listWork(db.pool, f.doctor.session, f.context)).toHaveLength(
      0,
    );
    expect(
      (await timeline(db.pool, f.patient.session, { kind: "patient" })).items,
    ).toHaveLength(0);
    expect(
      (
        await db.pool.query(
          "select id from mhistree.sources where patient_person_id=$1",
          [f.patient.personId],
        )
      ).rows,
    ).toHaveLength(0);
  } finally {
    await db.pool.query(
      "drop trigger fail_ai_entry_test on mhistree.persistent_state",
    );
  }
  await savePractitionerProposal(
    db.pool,
    f.doctor.session,
    f.context,
    input(run),
  );
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(1);
});

it("narrowed consent invalidates the old proposal and conversation; invented medication details are rejected", async () => {
  const f = await fixture(),
    text = "The patient reports fatigue.";
  const run = await suggest(f, text, [proposal("clinical", text)]);
  await setPatientConsent(db.pool, f.patient.session, {
    connectionId: f.connection,
    version: 1,
    mode: "narrow",
    categories: ["clinical"],
    exclusions: [],
  });
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input(run)),
  ).rejects.toThrow("VERSION_CONFLICT");
  await expect(suggest(f, "Please save that.", [], run.id)).rejects.toThrow(
    "VERSION_CONFLICT",
  );
  const g = await fixture();
  await expect(
    suggest(g, "The patient started an unidentified tablet.", [
      {
        ...proposal(
          "medication-use",
          "The patient started an unidentified tablet.",
        ),
        medicationDetails: { name: "Omeprazole", dose: null, frequency: null },
      },
    ]),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
});

it("organization capture preserves institution/context and loses write access on staff removal without borrowing direct permission", async () => {
  const f = await fixture(["clinical"]);
  const org = (
    await db.pool.query(
      "insert into mhistree.organizations(status,display_name) values('approved','Synthetic AI care org') returning id",
    )
  ).rows[0].id;
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,records.write,consent.manage,assignments.manage}')",
    [org, f.doctor.accountId],
  );
  const orgConnection = (
    await connectOrganization(db.pool, f.doctor.session, {
      organizationId: org,
      patientPersonId: f.patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical"],
      exclusions: [],
      evidence: "Synthetic organizational consent and identity verified.",
    })
  ).id;
  const assignment = await assignPatient(db.pool, f.doctor.session, {
    organizationId: org,
    connectionId: orgConnection,
    accountId: f.doctor.accountId,
    categories: ["clinical"],
  });
  const context = {
    kind: "organization" as const,
    connectionId: orgConnection,
    organizationId: org,
    assignmentId: assignment.id,
  };
  const text = "The patient reports fatigue during the consultation.";
  const run = await practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: orgConnection,
      question: text,
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
    },
    {
      generate: async () =>
        JSON.stringify({
          text: "Review this entry.",
          evidenceIds: [],
          limitations: [],
          proposals: [proposal("clinical", text)],
        }),
    },
    context,
  );
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input(run)),
  ).rejects.toThrow("ACCESS_DENIED");
  await savePractitionerProposal(
    db.pool,
    f.doctor.session,
    context,
    input(run),
  );
  const event = (
    await timeline(db.pool, f.patient.session, { kind: "patient" })
  ).items[0];
  expect(event.original_context).toBe(`organization:${orgConnection}`);
  expect(event.original_organization_id).toBe(org);
  expect(event.author_account_id).toBe(f.doctor.accountId);
  await db.pool.query(
    "update mhistree.memberships set active=false where organization_id=$1 and account_id=$2",
    [org, f.doctor.accountId],
  );
  await expect(
    savePractitionerProposal(db.pool, f.doctor.session, context, input(run)),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await directWorkspace(db.pool, f.doctor.session, f.connection))
      .patientPersonId,
  ).toBe(f.patient.personId);
});
