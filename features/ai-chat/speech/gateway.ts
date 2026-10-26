import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

export const transcriptionModel = "gemini-3.5-transcribe";
export const speechModel = "gemini-3.8-flash-lite-tts";
export interface SpeechGateway {
  transcribe(wav: Uint8Array, signal?: AbortSignal): Promise<string>;
  synthesize(text: string, signal?: AbortSignal): Promise<Uint8Array>;
}
const interaction = z.object({
  status: z.literal("completed"),
  steps: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(
          z.object({
            type: z.string(),
            text: z.string().optional(),
            data: z.string().optional(),
            mime_type: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
});
/** One provider attempt per explicit action: speech never replays expensive requests automatically. */
export class GeminiSpeechGateway implements SpeechGateway {
  constructor(private key: string) {}
  private async request(body: object, signal?: AbortSignal) {
    let response: Response;
    const deadline = AbortSignal.timeout(45000);
    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.key,
          },
          body: JSON.stringify({ ...body, store: false }),
          cache: "no-store",
          redirect: "error",
          signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
        },
      );
    } catch {
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new DomainError(
        response.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      );
    }
    // Bound the response as well as the upload; never log audio, transcripts or provider errors.
    const reader = response.body?.getReader();
    if (!reader) throw new DomainError("PROVIDER_UNAVAILABLE");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 6 * 1024 * 1024) {
          await reader.cancel();
          throw new DomainError("PROVIDER_UNAVAILABLE");
        }
        chunks.push(part.value);
      }
      const parsed = interaction.safeParse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (!parsed.success) throw new DomainError("PROVIDER_UNAVAILABLE");
      return parsed.data.steps
        .filter((s) => s.type === "model_output")
        .flatMap((s) => s.content ?? []);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("PROVIDER_UNAVAILABLE");
    } finally {
      reader.releaseLock();
    }
  }
  async transcribe(wav: Uint8Array, signal?: AbortSignal) {
    const content = await this.request(
      {
        model: transcriptionModel,
        input: [
          {
            type: "audio",
            data: Buffer.from(wav).toString("base64"),
            mime_type: "audio/wav",
          },
        ],
        generation_config: {
          transcription_config: { mode: { type: "verbatim" } },
        },
      },
      signal,
    );
    const text = content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (text.length > 10000) throw new DomainError("VALIDATION_FAILED");
    return text;
  }
  async synthesize(text: string, signal?: AbortSignal) {
    const content = await this.request(
      {
        model: speechModel,
        input: [
          {
            type: "user_input",
            content: [
              {
                type: "text",
                text,
                annotations: [
                  {
                    type: "speech_metadata",
                    style:
                      "Warm, calm, conversational, clear and unhurried. Read the supplied text exactly; do not add, omit or rewrite words.",
                  },
                ],
              },
            ],
          },
        ],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice: "Sulafat" }] },
      },
      signal,
    );
    const parts = content.filter((c) => c.type === "audio");
    if (
      parts.length !== 1 ||
      parts[0].mime_type !== "audio/wav" ||
      !parts[0].data ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(parts[0].data)
    )
      throw new DomainError("PROVIDER_UNAVAILABLE");
    const wav = Buffer.from(parts[0].data, "base64");
    if (
      wav.length < 44 ||
      wav.length > 4 * 1024 * 1024 ||
      wav.toString("ascii", 0, 4) !== "RIFF" ||
      wav.toString("ascii", 8, 12) !== "WAVE"
    )
      throw new DomainError("PROVIDER_UNAVAILABLE");
    return new Uint8Array(wav);
  }
}
