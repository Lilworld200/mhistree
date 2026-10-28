import { processInboxAnalysis } from "@/features/messaging/analysis";
// Exercise delivery and subsequent patient capture in separate transactions,
// as the new post-delivery processor does, without external provider requests.
async function sendAndAnalyzeCareMessage(
  ...args: Parameters<typeof storeCareMessage>
) {
  const result = await storeCareMessage(...args);
  if (args[2].kind === "patient")
    await processInboxAnalysis(
      args[0],
      args[1],
      args[2],
      (args[3] as { connectionId: string }).connectionId,
      {
        generate: async () => JSON.stringify({ items: [], clarifications: [] }),
      },
    );
  return result;
}
import { correctPatientReport } from "@/features/health-records/corrections";
import { directWorkspace } from "@/features/practitioner/workspace";
import { medicationSafetyContext } from "@/features/ai-chat/health-context";
import { recordSource } from "@/features/health-records/server";
import {
  enqueueMessageExtraction,
  processExtraction,
} from "@/features/ai-chat/extraction/server";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import { POST as connectedPOST } from "@/app/api/chat/connected-care/route";
import { NextRequest } from "next/server";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import {
  createConversation,
  sendMessage,
  conversationHistory,
  generateReply,
} from "@/features/ai-chat/server";
import { handoffSummary, prepareMemory } from "@/features/ai-chat/memory";
import {
  sendCareMessage as storeCareMessage,
  careMessages,
} from "@/features/messaging/server";
import {
  connectedChat,
  practitionerPresence,
} from "@/features/messaging/connected-chat";
import { healthState } from "@/features/health-records/current-state";
import { revokeConnection, withAccess } from "@/features/access/server";
import { pendingRecommendations } from "@/features/clinical-care/medication-recommendations";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
  vi.unstubAllEnvs();
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
      categories: ["clinical", "medication-use", "prescription", "allergy"],
      exclusions: [],
      evidence: "Synthetic identity and explicit consent checked in person.",
    })
  ).id;
  const context = { kind: "direct" as const, connectionId },
    id = randomUUID();
  await createConversation(db.pool, patient.session, id);
  return { doctor, patient, connectionId, context, id };
}
it("shares an immutable reviewed copy, reuses handoff/departure summary and keeps private summaries private", async () => {
  const f = await fixture();
  const text = "I felt tired after my synthetic walk.";
  const message = await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content: text,
    timezone: "Africa/Lagos",
  });
  let calls = 0;
  const gateway = {
    generate: async () => {
      calls++;
      return JSON.stringify({
        items: [
          {
            kind: "patient-report",
            text: "Felt tired after a walk.",
            healthRelevant: true,
            citations: [{ messageId: message.messageId, quote: text }],
          },
        ],
      });
    },
  };
  const first = await handoffSummary(db.pool, f.patient.session, f.id, gateway);
  expect(first.state).toBe("ready");
  const summary = first.attachment!;
  expect(summary.text).toContain("Felt tired");
  const key = randomUUID();
  const payload = {
    connectionId: f.connectionId,
    requestKey: key,
    content: "Please review this question.",
    originConversationId: f.id,
    summary,
  };
  const saved = await sendAndAnalyzeCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    payload,
  );
  expect(
    (
      await sendAndAnalyzeCareMessage(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        payload,
      )
    ).id,
  ).toBe(saved.id);
  const next = randomUUID();
  await createConversation(db.pool, f.patient.session, next, f.id);
  await prepareMemory(db.pool, f.patient.session, next, gateway);
  await handoffSummary(db.pool, f.patient.session, f.id, gateway);
  expect(calls).toBe(1);
  const thread = await careMessages(
    db.pool,
    f.doctor.session,
    f.context,
    f.connectionId,
  );
  expect(thread.items[0].summary_attachment.text).toBe(summary.text);
  const hidden = await withAccess(db.pool, f.doctor.session, f.context, (a) =>
    a.tx.query("select * from mhistree.chat_session_summaries"),
  );
  expect(hidden.rowCount).toBe(0);
  await expect(
    sendAndAnalyzeCareMessage(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      { ...payload, summary: { ...summary, text: "Changed" } },
    ),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("places incoming replies once in the active session, preserves origins, acknowledges displayed messages and expires presence", async () => {
  const f = await fixture();
  const second = randomUUID();
  await createConversation(db.pool, f.patient.session, second);
  const outgoing = await sendAndAnalyzeCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Reviewed question",
      originConversationId: f.id,
    },
  );
  expect(outgoing.deliveryState).toBe("stored");
  await connectedChat(db.pool, f.patient.session, {
    action: "sync",
    conversationId: f.id,
    active: true,
  });
  await connectedChat(db.pool, f.patient.session, {
    action: "sync",
    conversationId: second,
    active: true,
  });
  const reply = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Synthetic practitioner reply.",
    },
  );
  await connectedChat(db.pool, f.patient.session, {
    action: "sync",
    conversationId: f.id,
  });
  const sync = await connectedChat(db.pool, f.patient.session, {
    action: "sync",
    conversationId: second,
  });
  expect(sync.items.map((m) => m.id)).toContain(reply.id);
  expect(sync.items[0].origin_conversation_id).toBe(f.id);
  expect(
    (
      await connectedChat(db.pool, f.patient.session, {
        action: "sync",
        conversationId: f.id,
      })
    ).items,
  ).toHaveLength(0);
  const recipient = {
    connectionId: f.connectionId,
    practitionerId: f.doctor.accountId,
    connectionRevision: sync.recipients[0].revision,
  };
  await connectedChat(db.pool, f.patient.session, {
    action: "read",
    conversationId: second,
    recipient,
    throughSequence: sync.items[0].sequence,
  });
  expect(
    (
      await practitionerPresence(
        db.pool,
        f.doctor.session,
        f.context,
        f.connectionId,
      )
    ).online,
  ).toBe(true);
  await db.pool.query(
    "update mhistree.care_presence set expires_at=clock_timestamp()-interval '1 second'",
  );
  expect(
    (
      await practitionerPresence(
        db.pool,
        f.doctor.session,
        f.context,
        f.connectionId,
      )
    ).online,
  ).toBe(false);
  const key = randomUUID();
  const direct = {
    action: "send",
    conversationId: second,
    recipient,
    requestKey: key,
    content: "A deliberate direct response.",
  };
  const a = await connectedChat(db.pool, f.patient.session, direct),
    b = await connectedChat(db.pool, f.patient.session, direct);
  expect(a.messageId).toBe(b.messageId);
  expect(
    (await conversationHistory(db.pool, f.patient.session, second)).items,
  ).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select count(*)::int n from mhistree.chat_care_placements where message_id=$1",
        [reply.id],
      )
    ).rows[0].n,
  ).toBe(1);
  await revokeConnection(db.pool, f.patient.session, f.connectionId);
  await expect(
    connectedChat(db.pool, f.patient.session, direct),
  ).rejects.toThrow();
  expect(
    (
      await connectedChat(db.pool, f.patient.session, {
        action: "sync",
        conversationId: second,
      })
    ).items,
  ).toHaveLength(0);
});
it("keeps recommendations separate, captures planned → taking → stopped as linked history and never infers use from a practitioner yes", async () => {
  const f = await fixture();
  const msg = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Paracetamol: discuss the planned start.",
      recommendation: {
        name: "Paracetamol",
        details: "discuss the planned start.",
        reviewed: true,
      },
    },
  );
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Yes",
  });
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  const send = async (content: string) =>
    sendMessage(db.pool, f.patient.session, {
      conversationId: f.id,
      requestKey: randomUUID(),
      content,
      timezone: "Africa/Lagos",
    });
  await send("I'll start taking Paracetamol tomorrow.");
  let state = await healthState(db.pool, f.patient.session);
  expect(state.items).toHaveLength(1);
  expect(state.items[0].medicationPresentation?.useStatus).toBe("planned");
  await send("I am taking Paracetamol now.");
  state = await healthState(db.pool, f.patient.session);
  expect(state.items).toHaveLength(1);
  expect(state.items[0].body.medication.useStatus).toBe("taking");
  await send("I stopped taking Paracetamol.");
  state = await healthState(db.pool, f.patient.session);
  expect(state.items).toHaveLength(1);
  expect(state.items[0].body.medication.useStatus).toBe("stopped");
  expect(
    (
      await db.pool.query(
        "select count(*)::int n from mhistree.contributions where patient_person_id=$1",
        [f.patient.personId],
      )
    ).rows[0].n,
  ).toBe(3);
  expect(
    (
      await db.pool.query(
        "select state from mhistree.medication_recommendations where source_message_id=$1",
        [msg.id],
      )
    ).rows[0].state,
  ).toBe("stopped");
});
it("records actual daily follow-up delivery and only resolves an exact unambiguous medication question", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: planned start discussion.",
    recommendation: {
      name: "Paracetamol",
      details: "planned start discussion.",
      reviewed: true,
    },
  });
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: a second reviewed source for the same medicine.",
    recommendation: {
      name: "Paracetamol",
      details: "a second reviewed source for the same medicine.",
      reviewed: true,
    },
  });
  const send = async (content: string) =>
    sendMessage(db.pool, f.patient.session, {
      conversationId: f.id,
      requestKey: randomUUID(),
      content,
      timezone: "Africa/Lagos",
    });
  await send("I will start taking Paracetamol today.");
  const message = await send("I wanted to discuss Paracetamol.");
  await generateReply(db.pool, f.patient.session, message.messageId, {
    generate: async () => "We can talk through your medicine question.",
  });
  const history = await conversationHistory(db.pool, f.patient.session, f.id);
  expect(history.items.at(-1)?.content).toContain(
    "Have you started taking Paracetamol?",
  );
  const pending = await withAccess(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    (a) => pendingRecommendations(a, "Africa/Lagos"),
  );
  expect(pending.due).toHaveLength(0);
  await send("yes");
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .useStatus,
  ).toBe("taking");
});

it("links an inbox finding only after explicit reviewed publication; concurrent retries preserve one attachment", async () => {
  const f = await fixture(),
    text = "The patient has a confirmed latex allergy.";
  const message = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: text,
    },
  );
  const run = await practitionerAssistance(
    db.pool,
    f.doctor.session,
    {
      connectionId: f.connectionId,
      question: text,
      purpose: "draft",
      includeOwnNotes: false,
      conversation: true,
      originCareMessageId: message.id,
    },
    {
      generate: async () =>
        JSON.stringify({
          text: "Review this finding.",
          evidenceIds: [],
          limitations: [],
          proposals: [
            {
              category: "allergy",
              body: { text },
              occurredAt: { precision: "unknown" },
              status: "active",
              sourceSpans: [text],
              missingDetails: [],
              medicationDetails: null,
            },
          ],
        }),
    },
  );
  expect(
    (
      await careMessages(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).items[0].clinical_attachments,
  ).toHaveLength(0);
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  const input = {
    runId: run.id,
    itemId: run.proposals[0].id,
    destination: "record",
    reviewed: true,
    text,
  };
  await Promise.all([
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input),
    savePractitionerProposal(db.pool, f.doctor.session, f.context, input),
  ]);
  expect(
    (
      await careMessages(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).items[0].clinical_attachments,
  ).toHaveLength(1);
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].category,
  ).toBe("allergy");
});
it("shares the summary lease between concurrent handoff and departure preparation", async () => {
  const f = await fixture(),
    text = "A synthetic tired morning.";
  const message = await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content: text,
    timezone: "Africa/Lagos",
  });
  const target = randomUUID();
  await createConversation(db.pool, f.patient.session, target, f.id);
  let release!: () => void,
    started!: () => void,
    calls = 0;
  const begun = new Promise<void>((r) => (started = r)),
    hold = new Promise<void>((r) => (release = r));
  const gateway = {
    generate: async () => {
      calls++;
      started();
      await hold;
      return JSON.stringify({
        items: [
          {
            kind: "patient-report",
            text,
            citations: [{ messageId: message.messageId, quote: text }],
          },
        ],
      });
    },
  };
  const handoff = handoffSummary(db.pool, f.patient.session, f.id, gateway);
  await begun;
  expect(
    (await prepareMemory(db.pool, f.patient.session, target, gateway)).state,
  ).toBe("running");
  release();
  await handoff;
  expect(
    (await prepareMemory(db.pool, f.patient.session, target, gateway)).state,
  ).toBe("ready");
  expect(calls).toBe(1);
  const before = calls;
  await sendAndAnalyzeCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "A direct exchange.",
      originConversationId: f.id,
    },
  );
  await handoffSummary(db.pool, f.patient.session, f.id, gateway);
  expect(calls).toBe(before);
});
it("rejects foreign-origin connected-care HTTP requests before any database use", async () => {
  const response = await connectedPOST(
    new NextRequest("http://127.0.0.1:3000/api/chat/connected-care", {
      method: "POST",
      headers: {
        origin: "https://foreign.invalid",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "sync", conversationId: randomUUID() }),
    }),
  );
  expect(response.status).toBe(403);
});

it("retains declined and dismissed recommendation sources without inferring taking", async () => {
  const f = await fixture();
  const recommendation = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Paracetamol: discuss the plan.",
      recommendation: {
        name: "Paracetamol",
        details: "discuss the plan.",
        reviewed: true,
      },
    },
  );
  await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content: "I won't start taking Paracetamol.",
    timezone: "Africa/Lagos",
  });
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .useStatus,
  ).toBe("not-started");
  expect(
    (
      await withAccess(db.pool, f.patient.session, { kind: "patient" }, (a) =>
        pendingRecommendations(a, "Africa/Lagos"),
      )
    ).items,
  ).toHaveLength(0);
  expect(
    (
      await careMessages(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        f.connectionId,
      )
    ).items[0].id,
  ).toBe(recommendation.id);
});
it("refuses a model upgrade of an explicitly suspected finding to a confirmed allergy", async () => {
  const f = await fixture();
  await expect(
    practitionerAssistance(
      db.pool,
      f.doctor.session,
      {
        connectionId: f.connectionId,
        question: "I suspect a latex allergy.",
        purpose: "draft",
        includeOwnNotes: false,
        conversation: true,
      },
      {
        generate: async () =>
          JSON.stringify({
            text: "Review this.",
            evidenceIds: [],
            limitations: [],
            proposals: [
              {
                category: "allergy",
                body: { text: "Confirmed latex allergy." },
                occurredAt: { precision: "unknown" },
                status: "active",
                sourceSpans: ["latex allergy"],
                missingDetails: [],
                medicationDetails: null,
              },
            ],
          }),
      },
    ),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
});

it("reuses a captured medication commitment while extracting other reports from the same source", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  const content =
    "I will start taking Paracetamol tomorrow. I felt tired yesterday.";
  const message = await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content,
    timezone: "Africa/Lagos",
  });
  const job = await enqueueMessageExtraction(
    db.pool,
    f.patient.session,
    message.messageId,
  );
  const base = {
    evidence: "self-report",
    bodySite: null,
    status: "unknown",
    ambiguity: null,
    linkQuote: null,
    page: null,
  };
  await processExtraction(db.pool, f.patient.session, job, {
    generate: async () =>
      JSON.stringify({
        items: [
          {
            ...base,
            category: "medication-use",
            text: "will start taking Paracetamol",
            quote: "I will start taking Paracetamol tomorrow",
            timePhrase: "tomorrow",
            medicationName: "Paracetamol",
          },
          {
            ...base,
            category: "symptom",
            text: "felt tired",
            quote: "I felt tired yesterday",
            timePhrase: "yesterday",
            medicationName: null,
          },
        ],
        clarifications: [],
      }),
  });
  const events = (
    await db.pool.query(
      "select category from mhistree.contributions where patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows;
  expect(events.filter((e) => e.category === "medication-use")).toHaveLength(1);
  expect(events.filter((e) => e.category === "symptom")).toHaveLength(1);
});

it("keeps an assistant question visibly distinct from patient reports in a reviewed shared summary", async () => {
  const f = await fixture();
  const message = await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content: "I felt tired.",
    timezone: "Africa/Lagos",
  });
  const question = "How did you feel after resting?";
  await generateReply(db.pool, f.patient.session, message.messageId, {
    generate: async () => question,
  });
  const assistant = (
    await conversationHistory(db.pool, f.patient.session, f.id)
  ).items.at(-1)!;
  const result = await handoffSummary(db.pool, f.patient.session, f.id, {
    generate: async () =>
      JSON.stringify({
        items: [
          {
            kind: "open-question",
            text: question,
            healthRelevant: true,
            citations: [{ messageId: assistant.id, quote: question }],
          },
        ],
      }),
  });
  expect(result.attachment?.text).toContain("Mhistree question");
  expect(result.attachment?.text).not.toContain("Patient report");
});

it("binds a smart-apostrophe medication commitment and its start date to the exact preceding medicine question", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  const first = await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content: "I wanted to discuss Paracetamol.",
    timezone: "Africa/Lagos",
  });
  await generateReply(db.pool, f.patient.session, first.messageId, {
    generate: async () => "We can talk through that medicine question.",
  });
  const text = "I’ll start taking it tomorrow.";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2035-01-01T12:00:00Z"));
  try {
    await sendMessage(db.pool, f.patient.session, {
      conversationId: f.id,
      requestKey: randomUUID(),
      content: text,
      timezone: "Africa/Lagos",
    });
  } finally {
    vi.useRealTimers();
  }
  const state = await healthState(db.pool, f.patient.session);
  expect(state.items[0].medicationPresentation?.useStatus).toBe("planned");
  const captured = (
    await db.pool.query(
      "select captured_at from mhistree.chat_messages where conversation_id=$1 and content=$2",
      [f.id, text],
    )
  ).rows[0].captured_at as Date;
  const expected = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(captured.getTime() + 86400000));
  expect(state.items[0].body.medication.plannedStart).toBe(expected);
  const history = await conversationHistory(db.pool, f.patient.session, f.id);
  expect(history.items.at(-1)?.content).toBe(text);
});

it("queues a reply with no visible session and places it in the next opened session only once", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "A reviewed question before closing chat.",
      originConversationId: f.id,
    },
  );
  const reply = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "A reply while no patient session is visible.",
    },
  );
  expect(
    (
      await db.pool.query(
        "select 1 from mhistree.chat_care_placements where message_id=$1",
        [reply.id],
      )
    ).rowCount,
  ).toBe(0);
  const next = randomUUID();
  await createConversation(db.pool, f.patient.session, next);
  expect(
    (
      await connectedChat(db.pool, f.patient.session, {
        action: "sync",
        conversationId: next,
        active: true,
      })
    ).items.map((m) => m.id),
  ).toContain(reply.id);
  expect(
    (
      await connectedChat(db.pool, f.patient.session, {
        action: "sync",
        conversationId: f.id,
        active: true,
      })
    ).items,
  ).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select 1 from mhistree.chat_care_placements where message_id=$1",
        [reply.id],
      )
    ).rowCount,
  ).toBe(1);
});

it("keeps recommendation source references immutable for the application runtime", async () => {
  const result = (
    await db.pool.query(
      "select has_column_privilege('mhistree_runtime','mhistree.medication_recommendations','state','UPDATE') may_transition,has_column_privilege('mhistree_runtime','mhistree.medication_recommendations','source_message_id','UPDATE') may_repoint_message,has_column_privilege('mhistree_runtime','mhistree.medication_recommendations','source_event_id','UPDATE') may_repoint_event",
    )
  ).rows[0];
  expect(result).toEqual({
    may_transition: true,
    may_repoint_message: false,
    may_repoint_event: false,
  });
});

it("captures direct-care planned, exact-question taking and stopped reports from canonical patient sources without AI turns", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  const send = async (content: string) => {
    const message = await sendAndAnalyzeCareMessage(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      {
        connectionId: f.connectionId,
        requestKey: randomUUID(),
        content,
        timezone: "Africa/Lagos",
        replyToMessageId: (
          await careMessages(
            db.pool,
            f.patient.session,
            { kind: "patient" },
            f.connectionId,
          )
        ).items.at(-1)?.id,
      },
    );
    return { messageId: message.id };
  };
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "When, if at all, do you plan to start Paracetamol?",
  });
  const planned = await send("I’ll start taking it tomorrow.");
  expect(
    (await healthState(db.pool, f.patient.session)).items[0]
      .medicationPresentation?.useStatus,
  ).toBe("planned");
  const source = (
    await db.pool.query(
      "select s.care_message_id,s.chat_message_id,s.captured_at,m.sent_at,s.content from mhistree.sources s join mhistree.care_messages m on m.id=s.care_message_id where m.id=$1",
      [planned.messageId],
    )
  ).rows[0];
  expect(source.chat_message_id).toBeNull();
  expect(source.content).toBe("I’ll start taking it tomorrow.");
  expect(source.captured_at.toISOString()).toBe(source.sent_at.toISOString());
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Yes",
  });
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .useStatus,
  ).toBe("not-started");
  const question = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Have you started taking Paracetamol?",
    },
  );
  const taking = await send("yes");
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .useStatus,
  ).toBe("taking");
  expect(
    (
      await db.pool.query(
        "select question_care_message_id from mhistree.medication_commitments where care_message_id=$1",
        [taking.messageId],
      )
    ).rows[0].question_care_message_id,
  ).toBe(question.id);
  await send("I stopped taking Paracetamol today.");
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .useStatus,
  ).toBe("stopped");
  expect(
    (await conversationHistory(db.pool, f.patient.session, f.id)).items,
  ).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select 1 from mhistree.extraction_jobs where account_id=$1",
        [f.patient.accountId],
      )
    ).rowCount,
  ).toBe(0);
});

it("does not bind an unseen direct-care medicine question or a practitioner-authored source to the patient", async () => {
  const f = await fixture();
  for (const name of ["Paracetamol", "Ibuprofen"])
    await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: `${name}: discuss the plan.`,
      recommendation: { name, details: "discuss the plan.", reviewed: true },
    });
  const seen = await sendAndAnalyzeCareMessage(
    db.pool,
    f.doctor.session,
    f.context,
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "Have you started taking Paracetamol?",
    },
  );
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Have you started taking Ibuprofen?",
  });
  await sendAndAnalyzeCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connectionId,
      requestKey: randomUUID(),
      content: "yes",
      replyToMessageId: seen.id,
      timezone: "Africa/Lagos",
    },
  );
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  await expect(
    recordSource(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      {
        patientPersonId: f.patient.personId,
        category: "medication-use",
        sourceTimezone: "unknown",
        content: "Have you started taking Paracetamol?",
        careMessageId: seen.id,
        clientKey: randomUUID(),
      },
    ),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("preserves a long direct-care source and replays its bounded medication event once", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  const content =
    "I am taking Paracetamol now. " +
    "Additional synthetic context. ".repeat(100);
  const payload = {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content,
    timezone: "Africa/Lagos",
  };
  const first = await sendAndAnalyzeCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    payload,
  );
  expect(
    (
      await sendAndAnalyzeCareMessage(
        db.pool,
        f.patient.session,
        { kind: "patient" },
        payload,
      )
    ).id,
  ).toBe(first.id);
  const state = await healthState(db.pool, f.patient.session);
  expect(state.items).toHaveLength(1);
  expect(state.items[0].body.medication.useStatus).toBe("taking");
  expect(state.items[0].body.text).not.toContain(
    "Additional synthetic context",
  );
  expect(
    (
      await db.pool.query(
        "select content from mhistree.sources where care_message_id=$1",
        [first.id],
      )
    ).rows[0].content,
  ).toBe(content);
});

it("records later use after refusal independently while keeping initiation follow-ups closed", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  const send = async (content: string) =>
    sendAndAnalyzeCareMessage(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      {
        connectionId: f.connectionId,
        requestKey: randomUUID(),
        content,
        timezone: "Africa/Lagos",
      },
    );
  await send("I won't start taking Paracetamol.");
  await send("I am taking Paracetamol now.");
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .useStatus,
  ).toBe("taking");
  let workflow = (
    await db.pool.query(
      "select disposition,use_state,followups_closed from mhistree.medication_recommendations where patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows[0];
  expect(workflow).toEqual({
    disposition: "declined",
    use_state: "taking",
    followups_closed: true,
  });
  await send("I stopped taking Paracetamol.");
  await send("I will start taking Paracetamol tomorrow.");
  workflow = (
    await db.pool.query(
      "select disposition,use_state,followups_closed from mhistree.medication_recommendations where patient_person_id=$1",
      [f.patient.personId],
    )
  ).rows[0];
  expect(workflow).toEqual({
    disposition: "declined",
    use_state: "planned",
    followups_closed: true,
  });
  expect(
    (
      await withAccess(db.pool, f.patient.session, { kind: "patient" }, (a) =>
        pendingRecommendations(a, "Africa/Lagos"),
      )
    ).due,
  ).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select 1 from mhistree.contributions where patient_person_id=$1",
        [f.patient.personId],
      )
    ).rowCount,
  ).toBe(4);
});

it("keeps corrections to the latest medication logical record visible in patient and practitioner current views", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  await sendMessage(db.pool, f.patient.session, {
    conversationId: f.id,
    requestKey: randomUUID(),
    content: "I am taking Paracetamol now.",
    timezone: "Africa/Lagos",
  });
  const before = (await healthState(db.pool, f.patient.session)).items[0];
  const corrected = await correctPatientReport(db.pool, f.patient.session, {
    eventId: before.id,
    version: before.version,
    requestKey: randomUUID(),
    text: "I am taking Paracetamol; corrected wording only.",
    bodySite: null,
    status: before.status,
    medication: before.body.medication,
  });
  const current = await healthState(db.pool, f.patient.session);
  expect(current.items).toHaveLength(1);
  expect(current.items[0].id).toBe(corrected.eventId);
  const workspace = await directWorkspace(
    db.pool,
    f.doctor.session,
    f.connectionId,
  );
  expect(workspace.state.map((r) => r.id)).toContain(corrected.eventId);
  const safety = await medicationSafetyContext(
    db.pool,
    f.patient.session,
    f.patient.personId,
  );
  expect(safety.items.map((r) => r.id)).toContain(corrected.eventId);
});

it("does not turn current use into a guessed start date and retains an explicitly reported actual start", async () => {
  const f = await fixture();
  await sendAndAnalyzeCareMessage(db.pool, f.doctor.session, f.context, {
    connectionId: f.connectionId,
    requestKey: randomUUID(),
    content: "Paracetamol: discuss the plan.",
    recommendation: {
      name: "Paracetamol",
      details: "discuss the plan.",
      reviewed: true,
    },
  });
  const send = async (content: string) =>
    sendAndAnalyzeCareMessage(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      {
        connectionId: f.connectionId,
        requestKey: randomUUID(),
        content,
        timezone: "Africa/Lagos",
      },
    );
  await send("I am taking Paracetamol today.");
  expect(
    (await healthState(db.pool, f.patient.session)).items[0].body.medication
      .actualStart,
  ).toBeNull();
  await send("I started taking Paracetamol on 2020-01-02.");
  const record = (await healthState(db.pool, f.patient.session)).items[0];
  expect(record.body.medication.actualStart).toBe("2020-01-02");
  expect(record.occurred_at.precision).toBe("range");
});
