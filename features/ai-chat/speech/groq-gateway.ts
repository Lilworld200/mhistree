import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { groqBytes, groqJson, groqRequest } from "@/lib/ai/groq-request";
import type { SpeechGateway } from "./gateway";

export const groqTranscriptionModel = "whisper-large-v3-turbo";
export const groqSpeechModel = "canopylabs/orpheus-v1-english";

export class GroqSpeechGateway implements SpeechGateway {
  readonly transcriptionModel = groqTranscriptionModel;
  constructor(private key: string) {}

  async transcribe(wav: Uint8Array, signal?: AbortSignal) {
    const form = new FormData();
    form.set("model", groqTranscriptionModel);
    form.set(
      "file",
      new Blob([new Uint8Array(wav)], { type: "audio/wav" }),
      "recording.wav",
    );
    form.set("response_format", "json");
    form.set("temperature", "0");
    const result = z
      .object({ text: z.string().max(10000) })
      .safeParse(
        await groqJson(
          await groqRequest(this.key, "audio/transcriptions", form, signal),
        ),
      );
    if (!result.success) throw new DomainError("PROVIDER_UNAVAILABLE");
    return result.data.text;
  }

  async synthesize(text: string, signal?: AbortSignal) {
    // One complete saved reply per action; never truncate or fan out into paid chunks.
    if (!text.trim() || text.length > 10000)
      throw new DomainError("VALIDATION_FAILED");
    const response = await groqRequest(
      this.key,
      "audio/speech",
      JSON.stringify({
        model: groqSpeechModel,
        voice: "hannah",
        input: text,
        response_format: "wav",
      }),
      signal,
    );
    const wav = await groqBytes(response, 4 * 1024 * 1024);
    if (
      wav.length < 44 ||
      wav.toString("ascii", 0, 4) !== "RIFF" ||
      wav.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new DomainError("PROVIDER_UNAVAILABLE");
    return new Uint8Array(wav);
  }
}
