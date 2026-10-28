import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { sendCareMessage, careMessages } from "@/features/messaging/server";
import {
  inboxAnalysisStatus,
  processInboxAnalysis,
  openInboxFindings,
} from "@/features/messaging/analysis";
import { inboxConnections, acknowledgeInbox } from "@/features/messaging/inbox";
import {
  practitionerChatHistory,
  preparePractitionerReview,
  confirmPractitionerReview,
} from "@/features/clinical-care/practitioner-chat";
import { careNoteFields } from "@/features/clinical-care/care-note-schema";
import { healthState } from "@/features/health-records/current-state";
import { revokeConnection, withAccess } from "@/features/access/server";
import { createConversation, sendMessage } from "@/features/ai-chat/server";
import { handoffSummary } from "@/features/ai-chat/memory";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { aiGateway } from "@/lib/ai/gateway";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function fixture() {
  const doctor = await staffFixture(db.pool),
    patient = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.professionals set privileges=array_append(privileges,'messages.send') where account_id=$1",
    [doctor.accountId],
  );
  const connectionId = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: [
        "clinical",
        "symptom",
        "ongoing",
        "allergy",
        "prescription",
        "medication-use",
      ],
      exclusions: [],
      evidence: "Synthetic identity and explicit scope confirmed in person.",
    })
  ).id;
  return {
    doctor,
    patient,
    connectionId,
    context: { kind: "direct" as const, connectionId },
  };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function doctorMessage(f: F, content: string) {
  return sendCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    content,
    requestKey: randomUUID(),
    timezone: "Africa/Lagos",
  });
}
const finding = (category: string, text: string, details: object = {}) => ({
  category,
  body: { text, bodySite: null, contextLinks: [], careDetails: details },
  occurredAt: { precision: "unknown" },
  status: "active",
  sourceSpans: [text],
  missingDetails: [],
  medicationDetails: null,
});
const gateway = (proposals: unknown[]) => ({
  generate: async () =>
    JSON.stringify({
      text: "Review supplied findings.",
      evidenceIds: [],
      limitations: [],
      proposals,
    }),
});

it("delivers a separate conversation and explicit unread acknowledgements without an AI turn or clinical finding", async () => {
  const f = await fixture(),
    m = await doctorMessage(f, "Please come for a check-up.");
  expect(
    (await inboxConnections(db.pool, f.patient.session)).items,
  ).toMatchObject([{ connectionId: f.connectionId, unread: 1 }]);
  expect(
    (await inboxConnections(db.pool, f.doctor.session, true)).items[0]
      .connectionId,
  ).toBe(f.connectionId);
  expect(
    (
      await careMessages(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).items[0].id,
  ).toBe(m.id);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([]),
  );
  expect(
    (
      await inboxAnalysisStatus(
        db.pool,
        f.doctor.session,
        f.context,
        f.connectionId,
      )
    ).findings,
  ).toHaveLength(0);
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(0);
  const page = await careMessages(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
  );
  await acknowledgeInbox(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    page.items[0].sequence,
  );
  expect(
    (await inboxConnections(db.pool, f.patient.session)).items[0].unread,
  ).toBe(0);
  const health = await healthState(db.pool, f.patient.session);
  expect(health.items).toHaveLength(0);
  expect(health.prescriptions).toHaveLength(0);
});
it("stages definite and suspected findings for their author, then atomically publishes an editable combined review once", async () => {
  const f = await fixture(),
    text = "I confirmed hypertension. I suspect a latex allergy.";
  await doctorMessage(f, text);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      finding("ongoing", "I confirmed hypertension.", {
        name: "hypertension",
        certainty: "confirmed",
      }),
      finding("allergy", "I suspect a latex allergy.", {
        name: "latex",
        certainty: "suspected",
      }),
    ]),
  );
  const pending = await inboxAnalysisStatus(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
  );
  expect(pending.findings).toHaveLength(2);
  expect(
    (
      await inboxAnalysisStatus(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).findings,
  ).toHaveLength(0);
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(0);
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  const opened = await openInboxFindings(db.pool, f.doctor.session, f.context, {
    id: pending.findings[0].id,
    version: 1,
    action: "review",
  });
  const run = (
    await practitionerChatHistory(db.pool, f.doctor.session, f.context)
  ).items[0];
  expect(run.id).toBe(opened.id);
  const stage = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    {
      runId: run.id,
      destination: "record",
      timezone: "Africa/Lagos",
      items: run.proposals.map((p: { id: string; category: string }) => ({
        id: p.id,
        fields: careNoteFields.parse(
          p.category === "ongoing"
            ? { name: "hypertension", certainty: "confirmed", status: "active" }
            : { name: "latex", certainty: "suspected", status: "active" },
        ),
      })),
    },
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
        reviewId: stage.id,
        reviewed: true,
      }),
    ),
  );
  expect(results[0].id).toBe(results[1].id);
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(2);
  expect(
    (
      await inboxAnalysisStatus(
        db.pool,
        f.doctor.session,
        f.context,
        f.connectionId,
      )
    ).findings,
  ).toHaveLength(0);
  const stored = (
    await db.pool.query(
      "select state from mhistree.care_pending_findings where connection_id=$1",
      [f.connectionId],
    )
  ).rows;
  expect(stored.every((r) => r.state === "recorded")).toBe(true);
  expect(
    (
      await careMessages(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).items,
  ).toHaveLength(1);
});
it("captures clear patient reports using the original inbox source and prevents duplicate analysis", async () => {
  const f = await fixture(),
    content = "I have a headache today.";
  const message = await sendCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      content,
      requestKey: randomUUID(),
      timezone: "Africa/Lagos",
    },
  );
  const provider = {
    generate: async () =>
      JSON.stringify({
        items: [
          {
            category: "symptom",
            text: "experienced a headache.",
            quote: content,
            evidence: "self-report",
            timePhrase: "today",
            bodySite: null,
            medicationName: null,
            status: "active",
            ambiguity: null,
            linkQuote: null,
            page: null,
            relation: null,
            reportStyle: "reported-predicate",
          },
        ],
        clarifications: [],
      }),
  };
  const jobs = await inboxAnalysisStatus(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
  );
  await processInboxAnalysis(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    provider,
  );
  await processInboxAnalysis(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    provider,
    jobs.jobs[0].id,
  );
  const rows = (
    await db.pool.query(
      "select e.source_status,s.care_message_id,s.captured_at,m.sent_at from mhistree.contributions e join mhistree.sources s on s.id=e.source_id join mhistree.care_messages m on m.id=s.care_message_id where m.id=$1",
      [message.id],
    )
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].source_status).toBe("patient-reported");
  expect(rows[0].captured_at).toEqual(rows[0].sent_at);
});
it("allows patient-reported taking before practitioner publication without turning the recommendation into a prescription record", async () => {
  const f = await fixture(),
    text = "I recommend paracetamol 500 mg twice daily.";
  await doctorMessage(f, text);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      {
        ...finding("prescription", text, {
          name: "paracetamol",
          dose: "500 mg",
          frequency: "twice daily",
        }),
        medicationDetails: {
          name: "paracetamol",
          dose: "500 mg",
          frequency: "twice daily",
        },
      },
    ]),
  );
  expect(
    (await healthState(db.pool, f.patient.session)).prescriptions,
  ).toHaveLength(0);
  await sendCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      content: "I am taking paracetamol.",
      requestKey: randomUUID(),
      timezone: "Africa/Lagos",
    },
  );
  await processInboxAnalysis(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    { generate: async () => JSON.stringify({ items: [], clarifications: [] }) },
  );
  const health = await healthState(db.pool, f.patient.session);
  expect(health.items).toHaveLength(1);
  expect(health.prescriptions).toHaveLength(0);
  expect(health.items[0].body.medication.useStatus).toBe("taking");
  expect(health.items[0].body.careDetails?.dose).toBeUndefined();
  const pending = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).findings[0];
  await openInboxFindings(db.pool, f.doctor.session, f.context, {
    id: pending.id,
    version: pending.version,
    action: "review",
  });
  const run = (
    await practitionerChatHistory(db.pool, f.doctor.session, f.context)
  ).items.at(-1)!;
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
          id: pending.id,
          fields: careNoteFields.parse({
            name: "paracetamol",
            dose: "500 mg",
            frequency: "twice daily",
          }),
        },
      ],
    },
  );
  await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
    reviewId: review.id,
    reviewed: true,
  });
  const recommendations = (
    await db.pool.query(
      "select reviewed_event_id,use_state from mhistree.medication_recommendations where connection_id=$1",
      [f.connectionId],
    )
  ).rows;
  expect(recommendations).toHaveLength(1);
  expect(recommendations[0].reviewed_event_id).toBeTruthy();
  expect(recommendations[0].use_state).toBe("taking");
  await expect(
    withAccess(db.pool, f.patient.session, { kind: "patient" }, (a) =>
      a.tx.query(
        "update mhistree.medication_recommendations set reviewed_event_id=null where connection_id=$1",
        [f.connectionId],
      ),
    ),
  ).rejects.toMatchObject({ code: "42501" });
});

it("retains a logical report across clarification and records later improvement as a separate linked episode observation", async () => {
  const f = await fixture();
  const report = async (
    content: string,
    status = "active",
    relation: object | null = null,
    bodySite: string | null = null,
  ) => {
    await sendCareMessage(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      {
        connectionId: f.connectionId,
        content,
        requestKey: randomUUID(),
        timezone: "Africa/Lagos",
      },
    );
    return processInboxAnalysis(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      f.connectionId,
      {
        generate: async () =>
          JSON.stringify({
            items: [
              {
                category: "symptom",
                text: content,
                quote: content,
                evidence: "self-report",
                timePhrase: content.includes("today") ? "today" : "",
                bodySite,
                medicationName: null,
                status,
                ambiguity: null,
                linkQuote: null,
                page: null,
                relation,
              },
            ],
            clarifications: [],
          }),
      },
    );
  };
  await report("I have a headache today.");
  const first = (
    await db.pool.query(
      "select e.* from mhistree.contributions e where patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows[0];
  await report(
    "That same headache is on the left side.",
    "active",
    {
      eventId: first.id,
      kind: "same-report",
      referenceQuote: "That same headache",
    },
    "left side",
  );
  const current = (
    await db.pool.query(
      "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows;
  expect(current).toHaveLength(1);
  expect(current[0].logical_id).toBe(first.logical_id);
  expect(current[0].version).toBe(2);
  expect(current[0].occurred_at).toEqual(first.occurred_at);
  await report("My headache from this morning has stopped.", "resolved", {
    eventId: current[0].id,
    kind: "episode-update",
    referenceQuote: "My headache from this morning has stopped.",
  });
  const events = (
    await db.pool.query(
      "select * from mhistree.contributions where patient_person_id=$1 order by recorded_at,id",
      [f.patient.personId],
    )
  ).rows;
  expect(events).toHaveLength(3);
  expect(events[2].body.episodeUpdate.eventId).toBe(current[0].id);
  expect(events[2].occurred_at.precision).toBe("unknown");
});

it("keeps incomplete medicine details editable, blocks publication, and allows an author-only private note", async () => {
  const f = await fixture(),
    text = "I prescribe amlodipine.";
  await doctorMessage(f, text);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      {
        ...finding("prescription", text, { name: "amlodipine" }),
        medicationDetails: { name: "amlodipine", dose: null, frequency: null },
        missingDetails: ["dose", "frequency"],
      },
    ]),
  );
  const p = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).findings[0];
  await openInboxFindings(db.pool, f.doctor.session, f.context, {
    id: p.id,
    version: p.version,
    action: "review",
  });
  const run = (
    await practitionerChatHistory(db.pool, f.doctor.session, f.context)
  ).items[0];
  const input = {
    runId: run.id,
    destination: "record",
    timezone: "Africa/Lagos",
    items: [{ id: p.id, fields: careNoteFields.parse({ name: "amlodipine" }) }],
  };
  await expect(
    preparePractitionerReview(db.pool, f.doctor.session, f.context, input),
  ).rejects.toThrow();
  const review = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    {
      ...input,
      destination: "note",
      items: [{ id: p.id, fields: careNoteFields.parse({ content: text }) }],
    },
  );
  await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
    reviewId: review.id,
    reviewed: true,
  });
  expect(
    (await healthState(db.pool, f.patient.session)).prescriptions,
  ).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select state from mhistree.care_pending_findings where id=$1",
        [p.id],
      )
    ).rows[0].state,
  ).toBe("private");
});

it("does not deliver or publish generated findings when access is revoked during analysis", async () => {
  const f = await fixture(),
    text = "I confirmed hypertension.";
  await doctorMessage(f, text);
  const result = await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    {
      generate: async () => {
        await revokeConnection(db.pool, f.patient.session, f.connectionId);
        return gateway([
          finding("ongoing", text, {
            name: "hypertension",
            certainty: "confirmed",
          }),
        ]).generate();
      },
    },
  );
  expect(result.state).toBe("failed");
  expect(
    (
      await db.pool.query(
        "select id from mhistree.care_pending_findings where connection_id=$1",
        [f.connectionId],
      )
    ).rows,
  ).toHaveLength(0);
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
});
it("retains delivered messages on provider failure, supports explicit retry and keeps dismissed findings private from Health", async () => {
  const f = await fixture(),
    text = "I suspect asthma.";
  await doctorMessage(f, text);
  const failed = await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    {
      generate: async () => {
        throw new Error("synthetic provider outage");
      },
    },
  );
  expect(failed.state).toBe("failed");
  expect(
    (
      await careMessages(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).items,
  ).toHaveLength(1);
  const job = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).jobs[0];
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      finding("ongoing", text, { name: "asthma", certainty: "suspected" }),
    ]),
    job.id,
  );
  const p = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).findings[0];
  await openInboxFindings(db.pool, f.doctor.session, f.context, {
    id: p.id,
    version: p.version,
    action: "dismiss",
  });
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
});
it("withholds analysis and review after revocation, and refuses other authors", async () => {
  const f = await fixture(),
    other = await staffFixture(db.pool),
    text = "I confirmed hypertension.";
  await doctorMessage(f, text);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      finding("ongoing", text, {
        name: "hypertension",
        certainty: "confirmed",
      }),
    ]),
  );
  const p = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).findings[0];
  await expect(
    openInboxFindings(db.pool, other.session, f.context, {
      id: p.id,
      version: p.version,
      action: "review",
    }),
  ).rejects.toThrow();
  await revokeConnection(db.pool, f.patient.session, f.connectionId);
  await expect(
    openInboxFindings(db.pool, f.doctor.session, f.context, {
      id: p.id,
      version: p.version,
      action: "review",
    }),
  ).rejects.toThrow();
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
});

it("transfers only reviewed health-relevant summary items while retaining unrelated private context privately", async () => {
  const f = await fixture(),
    id = randomUUID();
  await createConversation(db.pool, f.patient.session, id);
  const health = await sendMessage(db.pool, f.patient.session, {
    conversationId: id,
    requestKey: randomUUID(),
    content: "I have a headache.",
    timezone: "Africa/Lagos",
  });
  const personal = await sendMessage(db.pool, f.patient.session, {
    conversationId: id,
    requestKey: randomUUID(),
    content: "I enjoy jazz music.",
    timezone: "Africa/Lagos",
  });
  const summary = await handoffSummary(db.pool, f.patient.session, id, {
    generate: async () =>
      JSON.stringify({
        items: [
          {
            kind: "patient-report",
            text: "Reported a headache.",
            healthRelevant: true,
            citations: [
              { messageId: health.messageId, quote: "I have a headache." },
            ],
          },
          {
            kind: "preference",
            text: "Enjoys jazz music.",
            healthRelevant: false,
            citations: [
              { messageId: personal.messageId, quote: "I enjoy jazz music." },
            ],
          },
        ],
      }),
  });
  expect(summary.attachment?.text).toContain("headache");
  expect(summary.attachment?.text).not.toContain("jazz");
  expect(
    (
      await db.pool.query(
        "select items from mhistree.chat_session_summaries where conversation_id=$1",
        [id],
      )
    ).rows[0].items,
  ).toHaveLength(2);
  await sendCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      content: "Please advise about my headache.",
      requestKey: randomUUID(),
      originConversationId: id,
      summary: summary.attachment,
      timezone: "Africa/Lagos",
    },
  );
  const messages = await careMessages(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
  );
  expect(messages.items[0].summary_attachment.text).not.toContain("jazz");
});

it("links typed clarification back to its pending inbox finding instead of leaving a duplicate pending draft", async () => {
  const f = await fixture(),
    initial = "I prescribe amlodipine.",
    question = "The dose is 5 mg, once daily.";
  await doctorMessage(f, initial);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      {
        ...finding("prescription", initial, { name: "amlodipine" }),
        medicationDetails: { name: "amlodipine", dose: null, frequency: null },
        missingDetails: ["dose", "frequency"],
      },
    ]),
  );
  const pending = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).findings[0];
  await openInboxFindings(db.pool, f.doctor.session, f.context, {
    id: pending.id,
    version: pending.version,
    action: "review",
  });
  const previous = (
    await practitionerChatHistory(db.pool, f.doctor.session, f.context)
  ).items[0];
  const clarified = await practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: f.connectionId,
      question,
      purpose: "question",
      conversation: true,
      includeOwnNotes: false,
      previousRunId: previous.id,
    },
    gateway([
      {
        ...finding("prescription", "I prescribe amlodipine 5 mg once daily.", {
          name: "amlodipine",
          dose: "5 mg",
          frequency: "once daily",
        }),
        sourceSpans: [initial, question],
        medicationDetails: {
          name: "amlodipine",
          dose: "5 mg",
          frequency: "once daily",
        },
      },
    ]),
  );
  expect(clarified.proposals[0].id).toBe(pending.id);
  const stage = await preparePractitionerReview(
    db.pool,
    f.doctor.session,
    f.context,
    {
      runId: clarified.id,
      destination: "record",
      timezone: "Africa/Lagos",
      items: [
        {
          id: pending.id,
          fields: careNoteFields.parse({
            name: "amlodipine",
            dose: "5 mg",
            frequency: "once daily",
          }),
        },
      ],
    },
  );
  await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
    reviewId: stage.id,
    reviewed: true,
  });
  expect(
    (
      await inboxAnalysisStatus(
        db.pool,
        f.doctor.session,
        f.context,
        f.connectionId,
      )
    ).findings,
  ).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select state from mhistree.care_pending_findings where id=$1",
        [pending.id],
      )
    ).rows[0].state,
  ).toBe("recorded");
});

it("serializes queued messages from one author before starting the next generation", async () => {
  const f = await fixture();
  await sendCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "First patient message.",
      timezone: "Africa/Lagos",
    },
  );
  const second = await sendCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Second patient message.",
      timezone: "Africa/Lagos",
    },
  );
  let release!: () => void,
    started!: () => void,
    calls = 0;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    entered = new Promise<void>((resolve) => (started = resolve));
  const provider = {
    generate: async () => {
      calls++;
      started();
      await gate;
      return JSON.stringify({ items: [], clarifications: [] });
    },
  };
  const first = processInboxAnalysis(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    provider,
  );
  await entered;
  const jobs = (
    await inboxAnalysisStatus(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      f.connectionId,
    )
  ).jobs;
  const result = await processInboxAnalysis(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    provider,
    jobs.find((j) => j.message_id === second.id)!.id,
  );
  expect(result.state).toBe("idle");
  expect(calls).toBe(1);
  release();
  await first;
  await processInboxAnalysis(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    f.connectionId,
    provider,
  );
  expect(calls).toBe(2);
});

it("serializes concurrent review openings for sibling findings and rejects stale versions", async () => {
  const f = await fixture(),
    text = "I confirmed hypertension. I suspect asthma.";
  await doctorMessage(f, text);
  await processInboxAnalysis(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
    gateway([
      finding("ongoing", "I confirmed hypertension.", {
        name: "hypertension",
        certainty: "confirmed",
      }),
      finding("ongoing", "I suspect asthma.", {
        name: "asthma",
        certainty: "suspected",
      }),
    ]),
  );
  const pending = (
    await inboxAnalysisStatus(
      db.pool,
      f.doctor.session,
      f.context,
      f.connectionId,
    )
  ).findings;
  const results = await Promise.allSettled(
    pending.map((p) =>
      openInboxFindings(db.pool, f.doctor.session, f.context, {
        id: p.id,
        version: p.version,
        action: "review",
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    (await practitionerChatHistory(db.pool, f.doctor.session, f.context)).items,
  ).toHaveLength(1);
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
});

it.skipIf(process.env.MHISTREE_LIVE_SEPARATE_INBOX !== "1")(
  "selected live provider analyses synthetic practitioner and patient inbox messages through reviewed publication",
  async () => {
    const env = parseEnv(await readFile(".env", "utf8"));
    for (const key of [
      "AI_PROVIDER",
      "AI_NVIDIA_MODEL",
      "NVIDIA_API_KEY",
      "AI_OPENROUTER_MODEL",
      "OPENROUTER_API_KEY",
      "GROQ_API_KEY",
    ])
      if (!process.env[key] && env[key]) process.env[key] = env[key];
    const provider = aiGateway(),
      f = await fixture();
    const observations: unknown[] = [];
    const gateway = {
      generate: async (...args: Parameters<typeof provider.generate>) => {
        const text = await provider.generate(...args);
        observations.push({ purpose: args[2]?.purpose, text });
        return text;
      },
    };
    try {
      await doctorMessage(
        f,
        "I suspect asthma. I recommend salbutamol. Please prepare these findings for review.",
      );
      expect(
        (
          await processInboxAnalysis(
            db.pool,
            f.doctor.session,
            f.context,
            f.connectionId,
            gateway,
          )
        ).state,
      ).toBe("completed");
      const pending = (
        await inboxAnalysisStatus(
          db.pool,
          f.doctor.session,
          f.context,
          f.connectionId,
        )
      ).findings;
      expect(pending.map((p) => p.category).sort()).toEqual([
        "ongoing",
        "prescription",
      ]);
      expect(
        (await healthState(db.pool, f.patient.session)).items,
      ).toHaveLength(0);
      await openInboxFindings(db.pool, f.doctor.session, f.context, {
        id: pending[0].id,
        version: pending[0].version,
        action: "review",
      });
      const run = (
        await practitionerChatHistory(db.pool, f.doctor.session, f.context)
      ).items[0];
      const stage = await preparePractitionerReview(
        db.pool,
        f.doctor.session,
        f.context,
        {
          runId: run.id,
          destination: "record",
          timezone: "Africa/Lagos",
          items: run.proposals.map((p: { id: string; category: string }) => ({
            id: p.id,
            fields: careNoteFields.parse(
              p.category === "ongoing"
                ? { name: "asthma", certainty: "suspected", status: "active" }
                : {
                    name: "salbutamol",
                    dose: "one inhalation",
                    frequency:
                      "as explicitly reviewed in this synthetic fixture",
                  },
            ),
          })),
        },
      );
      await confirmPractitionerReview(db.pool, f.doctor.session, f.context, {
        reviewId: stage.id,
        reviewed: true,
      });
      await sendCareMessage(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        {
          connectionId: f.connectionId,
          content: "I have a headache today.",
          requestKey: randomUUID(),
          timezone: "Africa/Lagos",
        },
      );
      expect(
        (
          await processInboxAnalysis(
            db.pool,
            f.patient.session,
            { kind: "patient" },
            f.connectionId,
            gateway,
          )
        ).state,
      ).toBe("completed");
      const reports = (
        await db.pool.query(
          "select e.* from mhistree.contributions e join mhistree.sources s on s.id=e.source_id where e.patient_person_id=$1 and s.care_message_id is not null and e.category='symptom'",
          [f.patient.personId],
        )
      ).rows;
      expect(reports).toHaveLength(1);
      expect(reports[0].source_status).toBe("patient-reported");
    } finally {
      await mkdir(".local/separate-inbox", { recursive: true });
      await writeFile(
        ".local/separate-inbox/live-synthetic.json",
        JSON.stringify({ model: provider.modelName, observations }, null, 2),
      );
    }
  },
  240000,
);
