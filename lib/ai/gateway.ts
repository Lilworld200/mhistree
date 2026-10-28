import "server-only";
import { z } from "zod";
import { requestGemini } from "./request";
import { DomainError } from "@/lib/errors";
import { aiDebug, withAIDebug } from "./debug";
import { GroqGateway } from "./groq";
import {
  patientReplySchema,
  patientReplyFormat,
  type PatientReply,
} from "@/features/ai-chat/care-action-schema";
export type AIMessage = { role: "user" | "assistant"; content: string };
export interface AIGateway {
  readonly modelName?: string;
  patientReply?(
    system: string,
    messages: AIMessage[],
    signal?: AbortSignal,
  ): Promise<PatientReply>;
  generate(
    system: string,
    messages: AIMessage[],
    options?: {
      responseSchema?: { name: string; schema: Record<string, unknown> };
      maxOutputTokens?: number;
      json?: boolean;
      signal?: AbortSignal;
      purpose?: "chat" | "extraction" | "clinician";
    },
  ): Promise<string>;
}
/** Reuses the configured provider/model through a single server-only gateway. No tools or provider fallbacks. */
export class GeminiGateway implements AIGateway {
  constructor(
    private config: {
      key: string;
      chatModel: string;
      extractionModel: string;
      clinicianModel?: string;
    },
  ) {}
  async patientReply(
    system: string,
    messages: AIMessage[],
    signal?: AbortSignal,
  ) {
    try {
      return patientReplySchema.parse(
        JSON.parse(
          await this.generate(system, messages, {
            json: true,
            maxOutputTokens: 2048,
            responseSchema: patientReplyFormat,
            signal,
          }),
        ),
      );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
  }
  get modelName() {
    return this.config.chatModel;
  }
  async generate(
    system: string,
    messages: AIMessage[],
    options: {
      responseSchema?: { name: string; schema: Record<string, unknown> };
      maxOutputTokens?: number;
      json?: boolean;
      signal?: AbortSignal;
      purpose?: "chat" | "extraction" | "clinician";
    } = {},
  ) {
    return withAIDebug(
      { operation: `provider.${options.purpose ?? "chat"}` },
      () => this.generateLogged(system, messages, options),
    );
  }
  private async generateLogged(
    system: string,
    messages: AIMessage[],
    options: NonNullable<Parameters<AIGateway["generate"]>[2]>,
  ) {
    const model =
      options.purpose === "extraction"
        ? this.config.extractionModel
        : options.purpose === "clinician"
          ? (this.config.clinicianModel ?? this.config.chatModel)
          : this.config.chatModel;
    aiDebug("provider.request", {
      model,
      purpose: options.purpose ?? "chat",
      messageCount: messages.length,
      inputCharacters:
        system.length + messages.reduce((n, m) => n + m.content.length, 0),
    });
    let response: Response;
    try {
      response = await requestGemini(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.config.key,
          },
          cache: "no-store",
          redirect: "error",
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              maxOutputTokens: Math.min(
                4096,
                Math.max(128, options.maxOutputTokens ?? 4096),
              ),
              temperature: 0.2,
              ...(options.json ? { responseMimeType: "application/json" } : {}),
              ...(options.responseSchema
                ? { responseJsonSchema: options.responseSchema.schema }
                : {}),
            },
          }),
        },
        model,
        options.signal,
      );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
    const payload: unknown = await response.json();
    const metadata = z
      .object({
        usageMetadata: z
          .object({
            promptTokenCount: z.number().int().nonnegative().optional(),
            candidatesTokenCount: z.number().int().nonnegative().optional(),
            totalTokenCount: z.number().int().nonnegative().optional(),
            cachedContentTokenCount: z.number().int().nonnegative().optional(),
            thoughtsTokenCount: z.number().int().nonnegative().optional(),
          })
          .optional(),
        candidates: z
          .array(z.object({ finishReason: z.string().optional() }))
          .optional(),
        promptFeedback: z
          .object({ blockReason: z.string().optional() })
          .optional(),
      })
      .safeParse(payload);
    if (metadata.success)
      aiDebug("provider.response", {
        model,
        finishReason:
          metadata.data.candidates?.[0]?.finishReason ??
          metadata.data.promptFeedback?.blockReason ??
          "UNKNOWN",
        ...metadata.data.usageMetadata,
      });
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
      .safeParse(payload);
    if (!result.success || result.data.candidates[0].finishReason !== "STOP")
      throw new DomainError("PROVIDER_UNAVAILABLE");
    const text = result.data.candidates[0].content.parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("");
    if (!text.trim() || text.length > 20000)
      throw new DomainError("PROVIDER_UNAVAILABLE");
    aiDebug("provider.output.ready", { model, outputCharacters: text.length });
    return text;
  }
}
export function aiGateway(): AIGateway {
  if ((process.env.AI_PROVIDER ?? "groq") === "groq") {
    const key = process.env.GROQ_API_KEY?.trim();
    if (!key) throw new DomainError("CONFIGURATION_REQUIRED");
    return new GroqGateway(key);
  }
  const config = z
    .object({
      AI_PROVIDER: z.literal("gemini"),
      GEMINI_API_KEY: z.string().min(1),
      AI_PATIENT_MODEL: z.string().min(1),
      AI_EXTRACTION_MODEL: z.string().min(1),
      AI_CLINICIAN_MODEL: z.string().min(1).optional(),
    })
    .safeParse(process.env);
  if (!config.success) throw new DomainError("CONFIGURATION_REQUIRED");
  return new GeminiGateway({
    key: config.data.GEMINI_API_KEY,
    chatModel: config.data.AI_PATIENT_MODEL,
    extractionModel: config.data.AI_EXTRACTION_MODEL,
    clinicianModel: config.data.AI_CLINICIAN_MODEL,
  });
}
