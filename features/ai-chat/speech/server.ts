import "server-only";
import { replyText } from "../reply-text";
import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { withAccess } from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { openFlow, sealFlow } from "@/lib/auth/flow-cookie";
import { speechConfiguration } from "./config";
import { GroqSpeechGateway } from "./groq-gateway";
import {
  GeminiSpeechGateway,
  transcriptionModel,
  type SpeechGateway,
} from "./gateway";
import {
  maxRecordingBytes,
  audioSampleRate,
  transcriptReceipt,
  type TranscriptReceipt,
} from "./schema";

export async function speechStatus(pool: Pool, session: string) {
  return withAccess(pool, session, { kind: "patient" }, async () => {
    speechConfiguration();
    return { enabled: true };
  });
}
async function authorizeSpeech(pool: Pool, session: string) {
  const actor = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => a.actor,
  );
  return actor;
}
export function validateRecording(bytes: Uint8Array) {
  const wav = Buffer.from(bytes);
  if (
    wav.length <= 44 ||
    wav.length > maxRecordingBytes ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.readUInt32LE(4) !== wav.length - 8 ||
    wav.toString("ascii", 8, 16) !== "WAVEfmt " ||
    wav.readUInt32LE(16) !== 16 ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.readUInt32LE(24) !== audioSampleRate ||
    wav.readUInt32LE(28) !== audioSampleRate * 2 ||
    wav.readUInt16LE(32) !== 2 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44 ||
    wav.length % 2
  )
    throw new DomainError("VALIDATION_FAILED");
  let energy = 0;
  for (let i = 44; i < wav.length; i += 2)
    energy += Math.pow(wav.readInt16LE(i) / 32768, 2);
  return {
    durationSeconds: (wav.length - 44) / (audioSampleRate * 2),
    silent: energy / ((wav.length - 44) / 2) < 0.000001,
  };
}
export async function transcribeRecording(
  pool: Pool,
  session: string,
  bytes: Uint8Array,
  signal?: AbortSignal,
  gateway?: SpeechGateway,
) {
  const actor = await authorizeSpeech(pool, session);
  const recording = validateRecording(bytes);
  if (recording.silent) return { text: "", token: "" };
  const config = speechConfiguration();
  const capturedAt = new Date().toISOString();
  const provider =
    gateway ??
    (config.provider === "groq"
      ? new GroqSpeechGateway(config.key)
      : new GeminiSpeechGateway(config.key));
  const text = await provider.transcribe(bytes, signal);
  await authorizeSpeech(pool, session);
  signal?.throwIfAborted();
  if (!text.trim()) return { text: "", token: "" };
  const receipt = transcriptReceipt.parse({
    id: randomUUID(),
    accountId: actor.accountId,
    sessionId: actor.sessionId,
    text,
    model: provider.transcriptionModel ?? transcriptionModel,
    capturedAt,
    audioSha256: createHash("sha256").update(bytes).digest("hex"),
    durationSeconds: recording.durationSeconds,
  });
  return {
    text,
    token: await sealFlow(JSON.stringify(receipt), "speech-transcript"),
  };
}
/** Receipts bind the provider transcript to this account/session; reviewed text remains the new patient report. */
export async function verifiedTranscript(
  token: string,
  accountId: string,
  sessionId: string,
): Promise<TranscriptReceipt> {
  const receipt = transcriptReceipt.parse(
    JSON.parse(await openFlow(token, "speech-transcript")),
  );
  if (receipt.accountId !== accountId || receipt.sessionId !== sessionId)
    throw new DomainError("ACCESS_DENIED");
  return receipt;
}
export async function speechPlaybackAccess(
  pool: Pool,
  session: string,
  messageId: string,
) {
  await authorizeSpeech(pool, session);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const row = (
      await a.tx.query(
        `select m.content from mhistree.chat_messages m join mhistree.chat_messages p on p.id=m.reply_to
       where m.id=$1 and m.role='assistant' and p.input_method='microphone'`,
        [messageId],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    return replyText(row.content as string);
  });
}
export async function synthesizeReply(
  pool: Pool,
  session: string,
  messageId: string,
  signal?: AbortSignal,
  gateway?: SpeechGateway,
) {
  await authorizeSpeech(pool, session);
  const read = () => speechPlaybackAccess(pool, session, messageId);
  const text = await read();
  if (!text || text.length > 10000) throw new DomainError("VALIDATION_FAILED");
  const config = speechConfiguration();
  const audio = await (
    gateway ??
    (config.provider === "groq"
      ? new GroqSpeechGateway(config.key)
      : new GeminiSpeechGateway(config.key))
  ).synthesize(text, signal);
  await authorizeSpeech(pool, session);
  if ((await read()) !== text) throw new DomainError("ACCESS_REVOKED");
  signal?.throwIfAborted();
  return audio;
}
