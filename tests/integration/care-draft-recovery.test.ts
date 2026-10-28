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
import { changeCareProposal } from "@/features/ai-chat/care-actions";
import type { PatientReply } from "@/features/ai-chat/care-action-schema";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function fixture() {
  const patient = await staffFixture(db.pool),
    doctor = await staffFixture(db.pool),
    connection = randomUUID(),
    conversation = randomUUID();
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read,messages.send}' where account_id=$1",
    [doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'active')",
    [connection, patient.personId, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom}','{}',$2,'{*}','login',$3)",
    [connection, [patient.personId], patient.accountId],
  );
  await createConversation(db.pool, patient.session, conversation);
  const say = async (content: string) =>
    sendMessage(db.pool, patient.session, {
      conversationId: conversation,
      requestKey: randomUUID(),
      content,
      timezone: "Africa/Lagos",
    });
  const answer = async (
    id: string,
    text: string,
    offer = false,
    urgent = false,
  ) => {
    const result: PatientReply = {
      text,
      action: null,
      sourceQuotes: [],
      dialogue: {
        topic: "health",
        decision: urgent ? "urgent" : "clarification",
        question: {
          kind: offer ? "offer_contact" : "none",
          subject: offer ? "care preparation" : "",
        },
      },
    };
    return generateReply(db.pool, patient.session, id, {
      generate: async () => {
        throw Error("unexpected extra provider call");
      },
      patientReply: async () => result,
    });
  };
  const history = () =>
    conversationHistory(db.pool, patient.session, conversation);
  const copies = async () =>
    Number(
      (
        await db.pool.query(
          "select count(*) from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=$1",
          [connection],
        )
      ).rows[0].count,
    );
  return {
    patient,
    doctor,
    connection,
    conversation,
    say,
    answer,
    history,
    copies,
  };
}
it("creates and displays a real grounded draft for okay-do-so, then sends only after reviewed confirmation", async () => {
  const f = await fixture();
  const report = await f.say("I have an unusual taste this morning.");
  await f.answer(
    report.messageId,
    "Would you like me to prepare a message for your doctor?",
    true,
  );
  const accepted = await f.say("okay do so");
  await f.answer(accepted.messageId, "I've sent your message to your doctor.");
  const h = await f.history(),
    p = h.items.at(-1)!.careProposal!;
  expect(p).toBeTruthy();
  expect(p.payload.content).toContain("unusual taste this morning");
  expect(p.payload.content).not.toContain("okay do so");
  expect(h.items.at(-1)!.content).toContain("review below");
  expect(h.pendingCareProposal?.id).toBe(p.id);
  expect(await f.copies()).toBe(0);
  const sent = await changeCareProposal(db.pool, f.patient.session, {
    id: p.id,
    version: p.version,
    action: "confirm",
  });
  expect(sent.state).toBe("completed");
  expect(await f.copies()).toBe(1);
  await changeCareProposal(db.pool, f.patient.session, {
    id: p.id,
    version: p.version,
    action: "confirm",
  });
  expect(await f.copies()).toBe(1);
});
it("recovers a legacy missing draft once, retains edits and receipts, and never resends on a recovery complaint", async () => {
  const f = await fixture();
  const report = await f.say("I have an unusual taste this morning.");
  await db.pool.query(
    "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,dialogue,reply_to) values(gen_random_uuid(),$1,$2,$3,'assistant',$4,'Africa/Lagos',$5,$6)",
    [
      f.conversation,
      f.patient.personId,
      f.patient.accountId,
      "Would you like me to prepare a message for your doctor?",
      { topic: "health", question: { kind: "offer_contact", subject: "care" } },
      report.messageId,
    ],
  );
  const accepted = await f.say("okay do so");
  await db.pool.query(
    "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,reply_to) values(gen_random_uuid(),$1,$2,$3,'assistant',$4,'Africa/Lagos',$5)",
    [
      f.conversation,
      f.patient.personId,
      f.patient.accountId,
      "The draft is ready for review.",
      accepted.messageId,
    ],
  );
  const missing = await f.say("I don't see any draft?");
  await f.answer(missing.messageId, "Resending the draft now.");
  const original = (await f.history()).pendingCareProposal!;
  expect(original.payload.content).toContain("unusual taste this morning");
  const edited = await changeCareProposal(db.pool, f.patient.session, {
    id: original.id,
    version: original.version,
    action: "update",
    payload: { ...original.payload, content: "My edited question for review." },
  });
  const retry = await f.say("resend it cause I am not seeing anything");
  await f.answer(retry.messageId, "I've sent it to your doctor.");
  const reopened = (await f.history()).pendingCareProposal!;
  expect(reopened.id).toBe(original.id);
  expect(reopened.payload.content).toBe("My edited question for review.");
  expect(await f.copies()).toBe(0);
  expect(
    Number(
      (
        await db.pool.query(
          "select count(*) from mhistree.chat_care_proposals where account_id=$1",
          [f.patient.accountId],
        )
      ).rows[0].count,
    ),
  ).toBe(1);
  await changeCareProposal(db.pool, f.patient.session, {
    id: edited.id,
    version: edited.version,
    action: "confirm",
  });
  const again = await f.say("resend the message please");
  await f.answer(again.messageId, "Resending the message now.");
  expect((await f.history()).items.at(-1)!.content).toContain(
    "already saved to Care inbox",
  );
  expect(await f.copies()).toBe(1);
});
it("does not manufacture a draft from an unsolicited model claim and keeps older saved drafts discoverable", async () => {
  const f = await fixture();
  const hello = await f.say("Hello.");
  await f.answer(hello.messageId, "I've prepared a message for your doctor.");
  expect((await f.history()).items.at(-1)!.careProposal).toBeNull();
  expect((await f.history()).items.at(-1)!.content).toContain(
    "haven't prepared or sent",
  );
  const request = await f.say("Please ask my doctor about my symptom.");
  await f.answer(request.messageId, "I've sent the message.");
  const p = (await f.history()).pendingCareProposal!;
  await db.pool.query(
    "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,request_key) select gen_random_uuid(),$1,$2,$3,'patient','Synthetic later conversation.','Africa/Lagos',gen_random_uuid() from generate_series(1,52)",
    [f.conversation, f.patient.personId, f.patient.accountId],
  );
  const h = await f.history();
  expect(h.items.every((m) => m.careProposal === null)).toBe(true);
  expect(h.pendingCareProposal?.id).toBe(p.id);
  await expect(
    conversationHistory(db.pool, f.doctor.session, f.conversation),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(await f.copies()).toBe(0);
});
it("preserves urgent real-world help while removing an invented delivery claim", async () => {
  const f = await fixture();
  const report = await f.say("I need urgent help with a new symptom.");
  await f.answer(
    report.messageId,
    "I've sent a message to your doctor. Call emergency services now.",
    false,
    true,
  );
  const h = await f.history();
  expect(h.items.at(-1)!.content).toContain("Call emergency services now.");
  expect(h.items.at(-1)!.content).not.toContain("I've sent");
  expect(h.pendingCareProposal).toBeNull();
  expect(await f.copies()).toBe(0);
});
