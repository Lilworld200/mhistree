import { beforeAll, afterAll, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  sendMessage,
  conversationHistory,
} from "@/features/ai-chat/server";
import { processExtraction } from "@/features/ai-chat/extraction/server";
import {
  transcribeRecording,
  synthesizeReply,
  speechStatus,
  speechPlaybackAccess,
} from "@/features/ai-chat/speech/server";
import { wavFromSamples } from "@/features/ai-chat/speech/recording";
import type { SpeechGateway } from "@/features/ai-chat/speech/gateway";
let db: Awaited<ReturnType<typeof testDatabase>>,
  patient: Awaited<ReturnType<typeof staffFixture>>,
  other: Awaited<ReturnType<typeof staffFixture>>,
  conversation: string;
const wav = new Uint8Array(
  wavFromSamples([new Float32Array(16000).fill(0.1)], 16000),
);
const adapter: SpeechGateway = {
  transcribe: vi.fn(async () => "I took five, no, ten milligrams."),
  synthesize: vi.fn(async () => wav),
};
beforeAll(async () => {
  db = await testDatabase();
  patient = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  conversation = randomUUID();
  await createConversation(db.pool, patient.session, conversation);
  vi.stubEnv("GEMINI_API_KEY", "synthetic");
  vi.stubEnv("AUTH_FLOW_COOKIE_KEY", "ab".repeat(32));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await db?.stop();
});
afterEach(() => vi.clearAllMocks());
it("saves original machine wording alongside reviewed text, replays once and excludes unsubmitted transcripts", async () => {
  const draft = await transcribeRecording(
    db.pool,
    patient.session,
    wav,
    undefined,
    adapter,
  );
  expect(
    (await conversationHistory(db.pool, patient.session, conversation)).items,
  ).toHaveLength(0);
  const input = {
    conversationId: conversation,
    requestKey: randomUUID(),
    content: "I took ten milligrams, drug name still unknown.",
    timezone: "Africa/Lagos",
    inputMethod: "microphone",
    transcriptionToken: draft.token,
  };
  const [first, second] = await Promise.all([
    sendMessage(db.pool, patient.session, input),
    sendMessage(db.pool, patient.session, input),
  ]);
  expect(first).toEqual(second);
  const saved = (
    await conversationHistory(db.pool, patient.session, conversation)
  ).items[0];
  expect(saved.content).toBe(input.content);
  expect(saved.inputMethod).toBe("microphone");
  expect(saved.transcription.text).toBe(draft.text);
  expect(saved.transcription.model).toBe("gemini-3.5-transcribe");
  expect(saved.transcription.sessionId).toBeUndefined();
  expect(
    (
      await db.pool.query(
        "select count(*)::int n from mhistree.extraction_jobs where message_id=$1",
        [first.messageId],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(
    sendMessage(db.pool, patient.session, {
      ...input,
      requestKey: randomUUID(),
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await expect(
    sendMessage(db.pool, patient.session, { ...input, content: "Changed" }),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("extracts only submitted reviewed text, never the original machine transcript", async () => {
  const row = (
    await db.pool.query(
      "select j.id from mhistree.extraction_jobs j join mhistree.chat_messages m on m.id=j.message_id where m.conversation_id=$1",
      [conversation],
    )
  ).rows[0];
  let source = "";
  await processExtraction(db.pool, patient.session, row.id, {
    generate: async (_system, messages) => {
      source = JSON.parse(messages[0].content).source;
      return JSON.stringify({ items: [], issues: [] });
    },
  });
  expect(source).toBe("I took ten milligrams, drug name still unknown.");
  expect(source).not.toContain("five, no");
});
it("rejects forged and cross-account receipts and microphone messages without review provenance", async () => {
  const draft = await transcribeRecording(
    db.pool,
    patient.session,
    wav,
    undefined,
    adapter,
  );
  const otherConversation = randomUUID();
  await createConversation(db.pool, other.session, otherConversation);
  await expect(
    sendMessage(db.pool, other.session, {
      conversationId: otherConversation,
      requestKey: randomUUID(),
      content: "Wrong owner",
      timezone: "UTC",
      inputMethod: "microphone",
      transcriptionToken: draft.token,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    sendMessage(db.pool, patient.session, {
      conversationId: conversation,
      requestKey: randomUUID(),
      content: "Forged",
      timezone: "UTC",
      inputMethod: "microphone",
    }),
  ).rejects.toThrow();
  await expect(
    sendMessage(db.pool, patient.session, {
      conversationId: conversation,
      requestKey: randomUUID(),
      content: "Forged",
      timezone: "UTC",
      inputMethod: "microphone",
      transcriptionToken: "tampered",
    }),
  ).rejects.toThrow("AUTH_REQUIRED");
});
it("synthesizes only a saved microphone reply and rechecks sessions after the provider call", async () => {
  const parent = (
    await conversationHistory(db.pool, patient.session, conversation)
  ).items[0];
  const id = randomUUID();
  await db.pool.query(
    "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,reply_to) values($1,$2,$3,$4,'assistant','Synthetic reply','UTC',$5)",
    [id, conversation, patient.personId, patient.accountId, parent.id],
  );
  expect(
    await synthesizeReply(db.pool, patient.session, id, undefined, adapter),
  ).toEqual(wav);
  expect(adapter.synthesize).toHaveBeenCalledWith("Synthetic reply", undefined);
  expect(await speechPlaybackAccess(db.pool, patient.session, id)).toBe(
    "Synthetic reply",
  );
  await expect(
    speechPlaybackAccess(db.pool, other.session, id),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    synthesizeReply(db.pool, other.session, id, undefined, adapter),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    synthesizeReply(db.pool, patient.session, parent.id, undefined, adapter),
  ).rejects.toThrow("ACCESS_DENIED");
  const retiring: SpeechGateway = {
    ...adapter,
    synthesize: async () => {
      await db.pool.query(
        "update mhistree.sessions set retired_at=clock_timestamp() where account_id=$1",
        [patient.accountId],
      );
      return wav;
    },
  };
  await expect(
    synthesizeReply(db.pool, patient.session, id, undefined, retiring),
  ).rejects.toThrow("SESSION_RETIRED");
});
it("enables all authenticated accounts without speech settings; silent recordings use no provider calls", async () => {
  const third = await staffFixture(db.pool);
  expect(await speechStatus(db.pool, other.session)).toEqual({ enabled: true });
  expect(await speechStatus(db.pool, third.session)).toEqual({ enabled: true });
  const silence = new Uint8Array(
    wavFromSamples([new Float32Array(16000)], 16000),
  );
  expect(
    await transcribeRecording(
      db.pool,
      other.session,
      silence,
      undefined,
      adapter,
    ),
  ).toEqual({ text: "", token: "" });
  expect(adapter.transcribe).not.toHaveBeenCalled();
  // Existing speech-specific configuration no longer gates or limits access.
  vi.stubEnv("SPEECH_ENABLED", "0");
  vi.stubEnv("SPEECH_ALLOWED_ACCOUNT_IDS", "");
  vi.stubEnv("SPEECH_PROJECT_PER_MINUTE", "0");
  const draft = await transcribeRecording(
    db.pool,
    third.session,
    wav,
    undefined,
    adapter,
  );
  expect(draft.text).toBe("I took five, no, ten milligrams.");
  expect(adapter.transcribe).toHaveBeenCalledTimes(1);
  expect(
    (
      await db.pool.query(
        "select count(*)::int n from mhistree.rate_limits where bucket like 'speech.%'",
      )
    ).rows[0].n,
  ).toBe(0);
  await expect(speechStatus(db.pool, "invalid")).rejects.toThrow(
    "AUTH_REQUIRED",
  );
});

it("keeps ordinary typed chat working before the optional voice migration is deployed", async () => {
  // This disposable database now represents the schema immediately before the additive migration.
  await db.pool.query(
    "alter table mhistree.chat_messages drop column input_method cascade, drop column transcription cascade",
  );
  const id = randomUUID();
  await createConversation(db.pool, other.session, id);
  const input = {
    conversationId: id,
    requestKey: randomUUID(),
    content: "Synthetic typed message",
    timezone: "UTC",
  };
  expect(await sendMessage(db.pool, other.session, input)).toEqual(
    await sendMessage(db.pool, other.session, input),
  );
  const history = await conversationHistory(db.pool, other.session, id);
  expect(history.items[0].inputMethod).toBe("text");
  expect(history.items[0].transcription).toBeNull();
});
