import {
  connectOrganization,
  assignPatient,
} from "@/features/organizations/assignments";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import { healthState } from "@/features/health-records/current-state";
import { revokeConnection } from "@/features/access/server";
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

import {
  practitionerChatHistory,
  preparePractitionerReview,
  confirmPractitionerReview,
} from "@/features/clinical-care/practitioner-chat";
import { careNoteFields } from "@/features/clinical-care/care-note-schema";
async function card(f: Fixture) {
  const text =
    "I confirmed malaria. I prescribe Quata 250 mg morning and night.";
  const run = await suggest(f, text, [
    {
      ...proposal("ongoing", "I confirmed malaria."),
      body: {
        text: "Confirmed malaria.",
        bodySite: null,
        contextLinks: [],
        careDetails: { name: "malaria", certainty: "confirmed" },
      },
    },
    {
      ...proposal(
        "prescription",
        "I prescribe Quata 250 mg morning and night.",
      ),
      medicationDetails: {
        name: "Quata",
        dose: "250 mg",
        frequency: "morning and night",
      },
      body: {
        text: "Prescribed Quata 250 mg morning and night.",
        bodySite: null,
        contextLinks: [],
        careDetails: {
          name: "Quata",
          dose: "250 mg",
          frequency: "morning and night",
        },
      },
    },
  ]);
  const edit = {
    runId: run.id,
    destination: "record",
    timezone: "Africa/Lagos",
    items: [
      {
        id: run.proposals[0].id,
        fields: careNoteFields.parse({
          name: "malaria",
          certainty: "confirmed",
        }),
      },
      {
        id: run.proposals[1].id,
        fields: careNoteFields.parse({
          name: "Quata",
          dose: "250 mg",
          frequency: "morning and night",
          indication: "For the reviewed condition",
        }),
      },
    ],
  };
  return { run, edit };
}
it("restores ongoing author history and atomically publishes a mixed editable card as normal text, with concurrent replay", async () => {
  const f = await fixture(),
    { run, edit } = await card(f);
  const before = await practitionerChatHistory(
    db.pool,
    f.doctor.session,
    f.context,
  );
  expect(before.items.map((i) => i.id)).toEqual([run.id]);
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    edit,
  );
  expect(review.text).toContain("Quata");
  expect(review.text).toContain("250 mg");
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(1);
  const [a, b] = await Promise.all(
    [1, 2].map(() =>
      confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
        reviewId: review.id,
        reviewed: true,
      }),
    ),
  );
  expect(a.id).toBe(b.id);
  const history = await practitionerChatHistory(
    db.pool,
    f.doctor.session,
    f.context,
  );
  expect(history.items).toHaveLength(2);
  expect(history.items[1].question).toContain("For the reviewed condition");
  expect(history.items[0].proposals).toEqual([]);
  const work = (
    await db.pool.query(
      "select * from mhistree.clinical_work where author_account_id=$1",
      [f.doctor.accountId],
    )
  ).rows;
  expect(work).toHaveLength(2);
  expect(work.every((w) => w.state === "finalized")).toBe(true);
  expect(work.every((w) => w.ai_provenance.approvalMessageId === a.id)).toBe(
    true,
  );
  expect(
    work.find((w) => w.category === "prescription").body.careDetails.indication,
  ).toBe("For the reviewed condition");
  const health = await healthState(db.pool, f.patient.session);
  expect(
    health.items.filter((i) => i.category === "medication-use"),
  ).toHaveLength(0);
  expect(health.prescriptions).toHaveLength(1);
});
it("validates missing medication fields before preparing or saving any item", async () => {
  const f = await fixture(),
    { edit } = await card(f);
  edit.items[1].fields.frequency = "";
  await expect(
    preparePractitionerReview(db.pool, f.doctor.session, f.context, edit),
  ).rejects.toThrow();
  expect(
    (
      await db.pool.query(
        "select id from mhistree.clinical_work where author_account_id=$1",
        [f.doctor.accountId],
      )
    ).rowCount,
  ).toBe(0);
});
it("rolls the entire mixed card back when a later finding is invalid at publication", async () => {
  const f = await fixture(),
    { edit } = await card(f);
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    edit,
  );
  // A separately saved item has consumed the stable operation key with different content.
  await savePractitionerProposal(db.pool, f.doctor.session, f.context, {
    runId: edit.runId,
    itemId: edit.items[1].id,
    destination: "note",
    reviewed: true,
    text: "Different private note.",
  });
  await expect(
    confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
      reviewId: review.id,
      reviewed: true,
    }),
  ).rejects.toThrow();
  const work = (
    await db.pool.query(
      "select category,kind,state from mhistree.clinical_work where author_account_id=$1",
      [f.doctor.accountId],
    )
  ).rows;
  expect(work).toHaveLength(1);
  expect(work[0].kind).toBe("private-note");
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(1);
});
it("invalidates an older displayed review after another version or normal message", async () => {
  const f = await fixture(),
    { edit } = await card(f);
  const first = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    edit,
  );
  edit.items[1].fields.dose = "500 mg";
  const second = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    edit,
  );
  await expect(
    confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
      reviewId: first.id,
      reviewed: true,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await suggest(f, "Do not save yet.", []);
  await expect(
    confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
      reviewId: second.id,
      reviewed: true,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("keeps private notes out of patient records and denies other authors and revoked contexts", async () => {
  const f = await fixture(),
    other = await staffFixture(db.pool),
    { edit } = await card(f);
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    {
      ...edit,
      destination: "note",
      items: edit.items.map((i) => ({
        ...i,
        fields: { ...i.fields, content: "Private author-only thinking." },
      })),
    },
  );
  await expect(
    confirmPractitionerReview(db.pool, other.session, f.context, {
      reviewId: review.id,
      reviewed: true,
    }),
  ).rejects.toThrow();
  await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
    reviewId: review.id,
    reviewed: true,
  });
  expect(
    (
      await db.pool.query(
        "select id from mhistree.clinical_work where author_account_id=$1 and kind='private-note'",
        [f.doctor.accountId],
      )
    ).rowCount,
  ).toBe(2);
  await revokeConnection(db.pool, f.patient.session, f.connection);
  await expect(
    practitionerChatHistory(db.pool, f.doctor.session, f.context),
  ).rejects.toThrow();
});

it("restores a prepared edited review, preserves occurrence time, and rejects expired confirmation", async () => {
  const f = await fixture(),
    { run, edit } = await card(f);
  edit.items[1].fields.dose = "500 mg";
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    edit,
  );
  const restored = await practitionerChatHistory(
    db.pool,
    f.doctor.session,
    f.context,
  );
  expect(restored.pendingDraft?.runId).toBe(run.id);
  expect(restored.pendingDraft?.version?.id).toBe(review.id);
  expect(restored.pendingDraft?.items[1].fields.dose).toBe("500 mg");
  await expect(
    suggest(f, "Read that unapproved draft as my text.", [], review.id),
  ).rejects.toThrow("VALIDATION_FAILED");
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 360000);
  try {
    await expect(
      confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
        reviewId: review.id,
        reviewed: true,
      }),
    ).rejects.toThrow("VERSION_CONFLICT");
  } finally {
    clock.mockRestore();
  }
});
it("paginates all historical messages without gaps even within one millisecond", async () => {
  const f = await fixture(),
    { run } = await card(f);
  await db.pool.query(
    `insert into mhistree.practitioner_ai_runs(account_id,connection_id,patient_person_id,purpose,question,response,evidence_ids,private_note_ids,created_at)
 select account_id,connection_id,patient_person_id,purpose,'Synthetic page '||i,response-'proposals'||'{"proposals":[]}'::jsonb,'{}','{}',date_trunc('milliseconds',created_at)+ i*interval '1 microsecond' from mhistree.practitioner_ai_runs cross join generate_series(1,36) i where id=$1`,
    [run.id],
  );
  const first = await practitionerChatHistory(
    db.pool,
    f.doctor.session,
    f.context,
  );
  expect(first.items).toHaveLength(30);
  expect(first.nextCursor).toBeTruthy();
  const second = await practitionerChatHistory(
    db.pool,
    f.doctor.session,
    f.context,
    first.nextCursor!,
  );
  expect(second.items).toHaveLength(7);
  expect(new Set([...first.items, ...second.items].map((t) => t.id)).size).toBe(
    37,
  );
  expect(second.nextCursor).toBeNull();
});
it("hides retained history and blocks confirmation after privileges narrow", async () => {
  const f = await fixture(),
    { edit } = await card(f),
    review = await preparePractitionerReview(
      db.pool,
      f.doctor.session,
      f.context,
      edit,
    );
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read}' where account_id=$1",
    [f.doctor.accountId],
  );
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(0);
  await expect(
    confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
      reviewId: review.id,
      reviewed: true,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
});

it("retains exact source timing when the practitioner leaves the event-date override blank", async () => {
  const f = await fixture(),
    text = "The patient reported fatigue at 10:00 on 2026-10-25.";
  const time = { precision: "exact", at: "2026-10-25T09:00:00.000Z" };
  const run = await suggest(f, text, [
    { ...proposal("clinical", text), occurredAt: time },
  ]);
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    {
      runId: run.id,
      destination: "record",
      timezone: "Africa/Lagos",
      items: [
        {
          id: run.proposals[0].id,
          fields: careNoteFields.parse({ content: text }),
        },
      ],
    },
  );
  expect(review.text).toContain(time.at);
  await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
    reviewId: review.id,
    reviewed: true,
  });
  const event = (
    await db.pool.query(
      "select occurred_at from mhistree.contributions where patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows[0];
  expect(event.occurred_at).toEqual(time);
});

it("keeps explicitly confirmed use separate from prescribing while linking both reviewed events", async () => {
  const f = await fixture(),
    text =
      "I prescribe Quata 250 mg morning and night. The patient is taking Quata 250 mg morning and night.";
  const medicationDetails = {
    name: "Quata",
    dose: "250 mg",
    frequency: "morning and night",
  };
  const run = await suggest(f, text, [
    {
      ...proposal("medication-use", text),
      medicationDetails,
      body: {
        text,
        bodySite: null,
        contextLinks: [],
        medication: {
          useStatus: "taking",
          plannedStart: null,
          plannedEnd: null,
          actualStart: null,
          actualEnd: null,
        },
      },
    },
    { ...proposal("prescription", text), medicationDetails },
  ]);
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    {
      runId: run.id,
      destination: "record",
      timezone: "Africa/Lagos",
      items: run.proposals.map((p) => ({
        id: p.id,
        fields: careNoteFields.parse({
          ...medicationDetails,
          ...(p.category === "medication-use" ? { useStatus: "taking" } : {}),
        }),
      })),
    },
  );
  await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
    reviewId: review.id,
    reviewed: true,
  });
  const health = await healthState(db.pool, f.patient.session);
  expect(health.prescriptions).toHaveLength(1);
  expect(
    health.items.filter((i) => i.category === "medication-use"),
  ).toHaveLength(1);
  const recommendation = (
    await db.pool.query(
      "select use_state,followups_closed from mhistree.medication_recommendations where patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows[0];
  expect(recommendation.use_state).toBe("taking");
  expect(recommendation.followups_closed).toBe(true);
});

it("isolates organization history from direct care and blocks review after staff removal", async () => {
  const f = await fixture(["clinical"]);
  const org = (
    await db.pool.query(
      "insert into mhistree.organizations(status,display_name) values('approved','Synthetic review organization') returning id",
    )
  ).rows[0].id;
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,records.write,consent.manage,assignments.manage}')",
    [org, f.doctor.accountId],
  );
  const conn = await connectOrganization(db.pool, f.doctor.session, {
    organizationId: org,
    patientPersonId: f.patient.personId,
    requestKey: randomUUID(),
    method: "in-person",
    categories: ["clinical"],
    exclusions: [],
    evidence: "Synthetic organization consent and identity verified.",
  });
  const assignment = await assignPatient(db.pool, f.doctor.session, {
    organizationId: org,
    connectionId: conn.id,
    accountId: f.doctor.accountId,
    categories: ["clinical"],
  });
  const context = {
    kind: "organization" as const,
    connectionId: conn.id,
    organizationId: org,
    assignmentId: assignment.id,
  };
  const text = "The patient reports fatigue.";
  const run = await practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: conn.id,
      question: text,
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
    },
    {
      generate: async () =>
        JSON.stringify({
          text: "Review your finding.",
          evidenceIds: [],
          limitations: [],
          proposals: [proposal("clinical", text)],
        }),
    },
    context,
  );
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(0);
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, context)).items,
  ).toHaveLength(1);
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    context,
    {
      runId: run.id,
      destination: "record",
      timezone: "Africa/Lagos",
      items: [
        {
          id: run.proposals[0].id,
          fields: careNoteFields.parse({ content: text }),
        },
      ],
    },
  );
  await db.pool.query(
    "update mhistree.memberships set active=false where organization_id=$1 and account_id=$2",
    [org, f.doctor.accountId],
  );
  await expect(
    confirmPractitionerReview(db.pool, f.doctor.session, context, {
      reviewId: review.id,
      reviewed: true,
    }),
  ).rejects.toThrow();
  await expect(
    practitionerChatHistory(db.pool, f.doctor.session, context),
  ).rejects.toThrow();
});
it("recovers eligible legacy direct history without rewriting stored runs", async () => {
  const f = await fixture(),
    { run } = await card(f);
  await db.pool.query(
    `insert into mhistree.practitioner_ai_runs(account_id,connection_id,patient_person_id,purpose,question,response,evidence_ids,private_note_ids)
 select account_id,connection_id,patient_person_id,purpose,'Synthetic legacy conversation',response-'chatScope'-'originalContext'-'proposals'||'{"proposals":[]}'::jsonb,'{}','{}' from mhistree.practitioner_ai_runs where id=$1`,
    [run.id],
  );
  const page = await practitionerChatHistory(
    db.pool,
    f.doctor.session,
    f.context,
  );
  expect(page.items).toHaveLength(2);
  expect(page.items.at(-1)?.question).toBe("Synthetic legacy conversation");
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read}' where account_id=$1",
    [f.doctor.accountId],
  );
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(0);
});
