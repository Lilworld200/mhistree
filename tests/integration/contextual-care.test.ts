import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
} from "@/features/ai-chat/server";
import { prepareMemory } from "@/features/ai-chat/memory";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import {
  careProposalOptions,
  changeCareProposal,
} from "@/features/ai-chat/care-actions";
import { withAccess } from "@/features/access/server";
import { getConnectedPractitioners } from "@/features/access/patient-controls";
import { sendCareMessage } from "@/features/messaging/server";
import { medicationSafetyContext } from "@/features/ai-chat/health-context";
import type {
  PatientReply,
  CareProposal,
} from "@/features/ai-chat/care-action-schema";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function setup() {
  const patient = await staffFixture(db.pool),
    a = await staffFixture(db.pool),
    b = await staffFixture(db.pool);
  for (const doctor of [a, b])
    await db.pool.query(
      "update mhistree.professionals set privileges='{records.read,messages.send,appointments.manage}' where account_id=$1",
      [doctor.accountId],
    );
  const connections = [];
  for (const doctor of [a, b]) {
    const id = randomUUID();
    await db.pool.query(
      "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'active')",
      [id, patient.personId, doctor.accountId],
    );
    await db.pool.query(
      "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom,allergy,medication-use}','{}',$2,'{*}','login',$3)",
      [id, [patient.personId], patient.accountId],
    );
    connections.push(id);
  }
  const conversation = randomUUID();
  await createConversation(db.pool, patient.session, conversation);
  return { patient, a, b, connections, conversation };
}
async function say(
  session: string,
  conversation: string,
  content: string,
  careConfirmationId?: string,
) {
  return sendMessage(db.pool, session, {
    conversationId: conversation,
    requestKey: randomUUID(),
    content,
    careConfirmationId,
    timezone: "Africa/Lagos",
  });
}
const noAction: PatientReply = {
  text: "Could you tell me more?",
  action: null,
  dialogue: {
    topic: "health",
    decision: "clarification",
    question: { kind: "symptom", subject: "dry throat" },
  },
  sourceQuotes: [],
};
async function reply(session: string, id: string, value: PatientReply) {
  return generateReply(db.pool, session, id, {
    generate: async () => {
      throw Error("unexpected provider path");
    },
    patientReply: async () => value,
  });
}
async function makeDraft(f: Awaited<ReturnType<typeof setup>>) {
  const sent = await say(
    f.patient.session,
    f.conversation,
    "Help me ask my doctor about a medicine I am considering.",
  );
  await reply(f.patient.session, sent.messageId, {
    ...noAction,
    text: "Please review this question before sending.",
    action: {
      kind: "message",
      connectionId: null,
      practitionerId: null,
      draft: "I have been taking 20mg daily.",
    },
  });
  return (
    await conversationHistory(db.pool, f.patient.session, f.conversation)
  ).items.at(-1)?.careProposal as CareProposal;
}
async function selectBoth(
  f: Awaited<ReturnType<typeof setup>>,
  proposal: CareProposal,
) {
  const options = await careProposalOptions(
    db.pool,
    f.patient.session,
    proposal.id,
  );
  const recipients = options.options.recipients.map((r) => ({
    connectionId: r.connectionId,
    practitionerId: r.practitionerId,
    connectionRevision: r.revision,
  }));
  const first = recipients[0];
  return changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: proposal.id,
    version: proposal.version,
    payload: {
      ...proposal.payload,
      recipients,
      connectionId: first.connectionId,
      practitionerId: first.practitionerId,
      connectionRevision: first.connectionRevision,
    },
  });
}
it("uses the dated departing summary and timeline for the dry-throat medication scenario, then distinguishes two yes answers", async () => {
  const f = await setup();
  const old = await say(
    f.patient.session,
    f.conversation,
    "I have a dry throat this morning.",
  );
  const source = await recordSource(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      patientPersonId: f.patient.personId,
      category: "symptom",
      sourceTimezone: "Africa/Lagos",
      content: "I have a dry throat this morning.",
      clientKey: randomUUID(),
    },
  );
  await acceptContribution(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      sourceId: source.sourceId,
      sourceVersion: 1,
      sourceItemId: "dry",
      operationKey: randomUUID(),
      body: { text: "I have a dry throat this morning." },
      occurredAt: { precision: "unknown" },
      status: "unknown",
      sourceSpans: ["I have a dry throat this morning."],
    },
  );
  await db.pool.query(
    "update mhistree.chat_messages set captured_at=clock_timestamp()-interval '20 minutes' where id=$1",
    [old.messageId],
  );
  const next = randomUUID();
  await createConversation(db.pool, f.patient.session, next, f.conversation);
  await prepareMemory(db.pool, f.patient.session, next, {
    generate: async (_s, m) => {
      const messages = JSON.parse(m[0].content).messages;
      const first = messages.find(
        (v: { role: string }) => v.role === "patient",
      );
      return JSON.stringify({
        items: [
          {
            kind: "patient-report",
            text: first.content,
            citations: [{ messageId: first.id, quote: first.content }],
          },
        ],
      });
    },
  });
  const question = await say(
    f.patient.session,
    next,
    "I want to take co trimazole",
  );
  let prompt = "";
  await generateReply(db.pool, f.patient.session, question.messageId, {
    generate: async () => "unused",
    patientReply: async (system) => {
      prompt = system;
      return {
        ...noAction,
        text: "You mentioned a dry throat earlier this morning. Is this what you are considering it for?",
      };
    },
  });
  expect(prompt).toContain("dry throat this morning");
  expect(prompt).toContain('"privateMemory"');
  expect(prompt).toContain('"evidence":[{');
  const yesSymptom = await say(
    f.patient.session,
    next,
    "Yes, I still have a dry throat.",
  );
  await reply(f.patient.session, yesSymptom.messageId, {
    ...noAction,
    text: "Would you like help asking a connected practitioner about this?",
    dialogue: {
      topic: "health",
      decision: "clinical_review",
      question: { kind: "offer_contact", subject: "medicine" },
    },
  });
  expect(
    (await conversationHistory(db.pool, f.patient.session, next)).items.at(-1)
      ?.careProposal,
  ).toBeNull();
  const yesContact = await say(f.patient.session, next, "yes");
  await reply(f.patient.session, yesContact.messageId, {
    ...noAction,
    text: "Review the question and selected practitioner below.",
  });
  const history = await conversationHistory(db.pool, f.patient.session, next);
  const proposal = history.items.at(-1)?.careProposal as CareProposal;
  expect(history.items.at(-1)?.content).toContain("put together a question");
  expect(proposal.payload.content).toContain("co trimazole");
  expect(proposal.payload.content).toContain("dry throat");
  expect(proposal.payload.recipients).toHaveLength(1);
  expect(
    (await db.pool.query("select count(*)::int n from mhistree.care_messages"))
      .rows[0].n,
  ).toBe(0);
});
it("sends typed go ahead only after the exact armed review, without calling the provider", async () => {
  const f = await setup(),
    draft = await selectBoth(f, await makeDraft(f));
  const armed = await changeCareProposal(db.pool, f.patient.session, {
    action: "arm",
    id: draft.id,
    version: draft.version,
  });
  expect(armed.confirmation?.question).toContain("Send this message");
  const sent = await say(
    f.patient.session,
    f.conversation,
    "go ahead",
    armed.confirmation!.id,
  );
  await generateReply(db.pool, f.patient.session, sent.messageId, {
    generate: async () => {
      throw Error("provider must not execute reviewed Send");
    },
  });
  const options = await careProposalOptions(
    db.pool,
    f.patient.session,
    draft.id,
  );
  expect(
    options.proposal.deliveries?.filter((d) => d.state === "stored"),
  ).toHaveLength(2);
  expect(
    (
      await conversationHistory(db.pool, f.patient.session, f.conversation)
    ).items.at(-1)?.content,
  ).toContain("2 care inboxes");
  const repeated = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: draft.id,
    version: draft.version,
  });
  expect(repeated.result_id).toBe(options.proposal.result_id);
});
it("leaves a symptom yes harmless, cancels on a Send no, and invalidates an armed version after editing", async () => {
  const f = await setup(),
    originalDraft = await makeDraft(f);
  const yes = await say(f.patient.session, f.conversation, "yes");
  await reply(f.patient.session, yes.messageId, noAction);
  expect(
    (
      await db.pool.query(
        "select count(*)::int n from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=any($1::uuid[])",
        [f.connections],
      )
    ).rows[0].n,
  ).toBe(0);
  await expect(
    changeCareProposal(db.pool, f.patient.session, {
      action: "arm",
      id: originalDraft.id,
      version: originalDraft.version,
    }),
  ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  let draft = await makeDraft(f);
  const cancellationReview = await changeCareProposal(
    db.pool,
    f.patient.session,
    {
      action: "arm",
      id: draft.id,
      version: draft.version,
    },
  );
  const no = await say(
    f.patient.session,
    f.conversation,
    "cancel",
    cancellationReview.confirmation!.id,
  );
  await generateReply(db.pool, f.patient.session, no.messageId, {
    generate: async () => {
      throw Error("no model needed");
    },
  });
  expect(
    (await careProposalOptions(db.pool, f.patient.session, draft.id)).proposal
      .state,
  ).toBe("draft");
  draft = await makeDraft(f);
  await changeCareProposal(db.pool, f.patient.session, {
    action: "arm",
    id: draft.id,
    version: draft.version,
  });
  await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: draft.id,
    version: draft.version,
    payload: { ...draft.payload, content: "A changed reviewed question." },
  });
  const okay = await say(f.patient.session, f.conversation, "okay");
  let called = false;
  await generateReply(db.pool, f.patient.session, okay.messageId, {
    generate: async () => {
      called = true;
      return "Please review your edited question.";
    },
  });
  expect(called).toBe(true);
});
it("sends eligible copies, retains failures and retries only unsaved destinations", async () => {
  const f = await setup(),
    draft = await selectBoth(f, await makeDraft(f));
  await db.pool.query(
    "update mhistree.connections set status='revoked',revision=revision+1 where id=$1",
    [f.connections[1]],
  );
  const partial = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: draft.id,
    version: draft.version,
  });
  expect(partial.state).toBe("partial");
  expect(partial.deliveries?.filter((d) => d.state === "stored")).toHaveLength(
    1,
  );
  expect(partial.deliveries?.filter((d) => d.state === "failed")).toHaveLength(
    1,
  );
  await db.pool.query(
    "update mhistree.connections set status='active',revision=revision+1 where id=$1",
    [f.connections[1]],
  );
  const options = await careProposalOptions(
    db.pool,
    f.patient.session,
    draft.id,
  );
  const recipients = options.options.recipients.map((r) => ({
    connectionId: r.connectionId,
    practitionerId: r.practitionerId,
    connectionRevision: r.revision,
  }));
  const first = recipients[0];
  const edited = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: draft.id,
    version: partial.version,
    payload: {
      ...draft.payload,
      recipients,
      connectionId: first.connectionId,
      practitionerId: first.practitionerId,
      connectionRevision: first.connectionRevision,
    },
  });
  const completed = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: draft.id,
    version: edited.version,
  });
  expect(completed.state).toBe("completed");
  for (const id of f.connections)
    expect(
      (
        await db.pool.query(
          "select count(*)::int n from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=$1",
          [id],
        )
      ).rows[0].n,
    ).toBe(1);
});
it("returns unrelated allergies in the separate medication safety context without leaking another patient", async () => {
  const f = await setup(),
    other = await staffFixture(db.pool);
  for (const actor of [f.patient, other]) {
    const text =
      actor === f.patient
        ? "Reported an allergy to penicillin"
        : "Private other-patient allergy";
    const s = await recordSource(
      db.pool,
      actor.session,
      { kind: "patient" },
      {
        patientPersonId: actor.personId,
        category: "allergy",
        sourceTimezone: "Africa/Lagos",
        content: text,
        clientKey: randomUUID(),
      },
    );
    await acceptContribution(
      db.pool,
      actor.session,
      { kind: "patient" },
      {
        sourceId: s.sourceId,
        sourceVersion: 1,
        sourceItemId: "allergy",
        operationKey: randomUUID(),
        body: { text },
        occurredAt: { precision: "unknown" },
        status: "unknown",
        sourceSpans: [text],
      },
    );
  }
  const context = await medicationSafetyContext(
    db.pool,
    f.patient.session,
    f.patient.personId,
  );
  expect(JSON.stringify(context)).toContain("penicillin");
  expect(JSON.stringify(context)).not.toContain("Private other-patient");
});

it("ranks the latest eligible grant until a practitioner is actually contacted", async () => {
  const f = await setup();
  expect(
    (await getConnectedPractitioners(db.pool, f.patient.session))
      .connectedPractitioners[0].connectionId,
  ).toBe(f.connections[1]);
  await sendCareMessage(
    db.pool,
    f.patient.session,
    { kind: "patient" },
    {
      connectionId: f.connections[0],
      requestKey: randomUUID(),
      content: "Synthetic prior contact",
    },
  );
  expect(
    (await getConnectedPractitioners(db.pool, f.patient.session))
      .connectedPractitioners[0].connectionId,
  ).toBe(f.connections[0]);
});
it("deduplicates two selected organization practitioners into one shared inbox copy", async () => {
  const f = await setup(),
    org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "update mhistree.connections set kind='organization',practitioner_account_id=null,organization_id=$2 where id=$1",
    [f.connections[0], org],
  );
  await db.pool.query(
    "update mhistree.connections set status='revoked' where id=$1",
    [f.connections[1]],
  );
  for (const doctor of [f.a, f.b]) {
    await db.pool.query(
      "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,messages.send}')",
      [org, doctor.accountId],
    );
    await db.pool.query(
      "insert into mhistree.assignments(organization_id,patient_person_id,account_id,active,categories) values($1,$2,$3,true,'{symptom}')",
      [org, f.patient.personId, doctor.accountId],
    );
  }
  const draft = await selectBoth(f, await makeDraft(f));
  expect(draft.payload.recipients).toHaveLength(2);
  const result = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: draft.id,
    version: draft.version,
  });
  expect(result.state).toBe("completed");
  expect(result.deliveries).toHaveLength(1);
});
it("keeps delivery and confirmation rows private to the owning patient", async () => {
  const f = await setup(),
    draft = await makeDraft(f),
    outsider = await staffFixture(db.pool);
  await changeCareProposal(db.pool, f.patient.session, {
    action: "arm",
    id: draft.id,
    version: draft.version,
  });
  await withAccess(
    db.pool,
    outsider.session,
    { kind: "patient" },
    async (a) => {
      expect(
        (
          await a.tx.query(
            "select * from mhistree.chat_care_confirmations where proposal_id=$1",
            [draft.id],
          )
        ).rowCount,
      ).toBe(0);
    },
  );
  await expect(
    careProposalOptions(db.pool, outsider.session, draft.id),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: draft.id,
    version: draft.version,
  });
  await withAccess(
    db.pool,
    outsider.session,
    { kind: "patient" },
    async (a) => {
      expect(
        (
          await a.tx.query(
            "select * from mhistree.chat_care_deliveries where proposal_id=$1",
            [draft.id],
          )
        ).rowCount,
      ).toBe(0);
    },
  );
});
it("requires the displayed confirmation token and rejects an expired review", async () => {
  for (const expired of [false, true]) {
    const f = await setup(),
      draft = await makeDraft(f);
    const armed = await changeCareProposal(db.pool, f.patient.session, {
      action: "arm",
      id: draft.id,
      version: draft.version,
    });
    if (expired)
      await db.pool.query(
        "update mhistree.chat_care_confirmations set expires_at=clock_timestamp()-interval '1 second' where proposal_id=$1",
        [draft.id],
      );
    const yes = await say(
      f.patient.session,
      f.conversation,
      "go ahead",
      expired ? armed.confirmation!.id : undefined,
    );
    let called = false;
    await generateReply(db.pool, f.patient.session, yes.messageId, {
      generate: async () => {
        called = true;
        return "Please review the message before sending.";
      },
    });
    expect(called).toBe(true);
    expect(
      (await careProposalOptions(db.pool, f.patient.session, draft.id)).proposal
        .state,
    ).toBe("draft");
  }
});
