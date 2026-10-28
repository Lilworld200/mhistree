import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import type { AIGateway, AIMessage } from "./gateway";
import { aiDebug, withAIDebug } from "./debug";
import { groqJson, groqRequest } from "./groq-request";

import {
  patientReplySchema,
  patientReplyFormat,
} from "@/features/ai-chat/care-action-schema";

export const groqChatModel = "openai/gpt-oss-20b";

export class GroqGateway implements AIGateway {
  constructor(
    private key: string,
    readonly modelName = groqChatModel,
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
            responseSchema: patientReplyFormat,
            maxOutputTokens: 2048,
            signal,
          }),
        ),
      );
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
  }

  generate(
    system: string,
    messages: AIMessage[],
    options: NonNullable<Parameters<AIGateway["generate"]>[2]> = {},
  ) {
    return withAIDebug(
      { operation: `provider.${options.purpose ?? "chat"}` },
      async () => {
        const maximum = Math.min(
          4096,
          Math.max(
            128,
            options.maxOutputTokens ?? (options.json ? 4096 : 1536),
          ),
        );
        aiDebug("provider.request", {
          model: this.modelName,
          purpose: options.purpose ?? "chat",
          messageCount: messages.length,
          inputCharacters:
            system.length +
            messages.reduce((sum, m) => sum + m.content.length, 0),
        });
        const response = await groqRequest(
          this.key,
          "chat/completions",
          JSON.stringify({
            model: this.modelName,
            messages: [
              {
                role: "system",
                content:
                  system +
                  (options.json
                    ? "\nReturn only a JSON object matching the requested structure."
                    : ""),
              },
              ...messages,
            ],
            max_completion_tokens: maximum,
            reasoning_effort: "low",
            include_reasoning: false,
            temperature: 0.2,
            ...(options.responseSchema
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: { ...options.responseSchema, strict: true },
                  },
                }
              : options.json
                ? { response_format: { type: "json_object" } }
                : {}),
          }),
          options.signal,
        );
        const result = z
          .object({
            choices: z
              .array(
                z.object({
                  finish_reason: z.literal("stop"),
                  message: z.object({
                    content: z.string().trim().min(1).max(20000),
                  }),
                }),
              )
              .length(1),
            usage: z
              .object({
                prompt_tokens: z.number().int().nonnegative(),
                completion_tokens: z.number().int().nonnegative(),
                total_tokens: z.number().int().nonnegative(),
              })
              .optional(),
          })
          .safeParse(await groqJson(response));
        if (!result.success) throw new DomainError("PROVIDER_UNAVAILABLE");
        aiDebug("provider.response", {
          model: this.modelName,
          finishReason: "stop",
          promptTokenCount: result.data.usage?.prompt_tokens,
          candidatesTokenCount: result.data.usage?.completion_tokens,
          totalTokenCount: result.data.usage?.total_tokens,
        });
        const text = result.data.choices[0].message.content;
        // Keep private reasoning out of stored conversations even if upstream ignores the flag.
        if (/<\/?think\b/i.test(text))
          throw new DomainError("PROVIDER_UNAVAILABLE");
        if (options.json) {
          try {
            const value: unknown = JSON.parse(text);
            if (!value || typeof value !== "object" || Array.isArray(value))
              throw new Error();
          } catch {
            throw new DomainError("PROVIDER_UNAVAILABLE");
          }
        }
        aiDebug("provider.output.ready", {
          model: this.modelName,
          outputCharacters: text.length,
        });
        return text;
      },
    );
  }
}
