import { z } from "zod";

export const maxRecordingSeconds = 60;
export const silenceSeconds = 5;
export const audioSampleRate = 16000;
export const maxRecordingBytes = 44 + audioSampleRate * 2 * maxRecordingSeconds;
export const transcriptReceipt = z
  .object({
    id: z.uuid(),
    accountId: z.uuid(),
    sessionId: z.uuid(),
    text: z.string().min(1).max(10000),
    model: z.string().min(1).max(100),
    capturedAt: z.iso.datetime(),
    audioSha256: z.string().regex(/^[a-f0-9]{64}$/),
    durationSeconds: z.number().positive().max(maxRecordingSeconds),
  })
  .strict();
export type TranscriptReceipt = z.infer<typeof transcriptReceipt>;
export type TranscriptDraft = { text: string; token: string };
export const speechInput = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("transcribe"),
      base64: z
        .string()
        .min(1)
        .max(Math.ceil(maxRecordingBytes / 3) * 4)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    })
    .strict(),
  z.object({ action: z.literal("synthesize"), messageId: z.uuid() }).strict(),
]);
