import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
export type AIMessage = { role: "user" | "assistant"; content: string };
export interface AIGateway {
  generate(
    system: string,
    messages: AIMessage[],
    options?: {
      json?: boolean;
      signal?: AbortSignal;
      purpose?: "chat" | "extraction";
    },
  ): Promise<string>;
}
/** Reuses the configured provider/model through a single server-only gateway. No tools or provider fallbacks. */
export class GeminiGateway implements AIGateway {
  constructor(
    private config: { key: string; chatModel: string; extractionModel: string },
  ) {}
  async generate(
    system: string,
    messages: AIMessage[],
    options: {
      json?: boolean;
      signal?: AbortSignal;
      purpose?: "chat" | "extraction";
    } = {},
  ) {
    const model =
      options.purpose === "extraction"
        ? this.config.extractionModel
        : this.config.chatModel;
    let response: Response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.config.key,
          },
          cache: "no-store",
          redirect: "error",
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(45000)])
            : AbortSignal.timeout(45000),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              maxOutputTokens: 4096,
              temperature: 0.2,
              ...(options.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
        },
      );
    } catch {
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok)
      throw new DomainError(
        response.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      );
    const result = z
      .object({
        candidates: z
          .array(
            z.object({
              finishReason: z.string(),
              content: z.object({
                parts: z.array(
                  z.object({
                    text: z.string().optional(),
                    thought: z.boolean().optional(),
                  }),
                ),
              }),
            }),
          )
          .min(1),
      })
      .safeParse(await response.json());
    if (!result.success || result.data.candidates[0].finishReason !== "STOP")
      throw new DomainError("PROVIDER_UNAVAILABLE");
    const text = result.data.candidates[0].content.parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    if (!text.trim() || text.length > 20000)
      throw new DomainError("PROVIDER_UNAVAILABLE");
    return text;
  }
}
export function aiGateway(): AIGateway {
  const config = z
    .object({
      AI_PROVIDER: z.literal("gemini"),
      GEMINI_API_KEY: z.string().min(1),
      AI_PATIENT_MODEL: z.string().min(1),
      AI_EXTRACTION_MODEL: z.string().min(1),
    })
    .safeParse(process.env);
  if (!config.success) throw new DomainError("CONFIGURATION_REQUIRED");
  return new GeminiGateway({
    key: config.data.GEMINI_API_KEY,
    chatModel: config.data.AI_PATIENT_MODEL,
    extractionModel: config.data.AI_EXTRACTION_MODEL,
  });
}
