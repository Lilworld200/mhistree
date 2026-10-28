import "server-only";
import { z } from "zod";
import type { AIGateway, AIMessage } from "./gateway";
import { DomainError } from "@/lib/errors";
import { aiDebug, withAIDebug } from "./debug";
import {
  patientReplySchema,
  patientReplyFormat,
} from "@/features/ai-chat/care-action-schema";

export type CompatibleProvider = "nvidia" | "openrouter";
const urls = {
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;
const completion = z.object({
  error: z.unknown().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({ content: z.string().trim().min(1).max(20000) }),
      }),
    )
    .length(1),
  usage: z
    .object({
      prompt_tokens: z.number().nonnegative(),
      completion_tokens: z.number().nonnegative(),
      total_tokens: z.number().nonnegative(),
    })
    .optional(),
});
async function payload(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new DomainError("PROVIDER_UNAVAILABLE");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 256 * 1024) throw new DomainError("PROVIDER_UNAVAILABLE");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    await reader.cancel().catch(() => {});
    throw new DomainError("PROVIDER_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
}

/** Explicit provider/model selection. One request, no model or provider fallback.
 * Some free models lack response_format: their output still passes the same strict
 * local schema/source checks; JSON instructions are part of this one generation.
 */
export class CompatibleGateway implements AIGateway {
  readonly observedUsage = {
    requests: 0,
    responses: 0,
    usageResponses: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
  constructor(
    private key: string,
    readonly provider: CompatibleProvider,
    readonly modelName: string,
  ) {
    if (
      !key.trim() ||
      !modelName.trim() ||
      (provider === "openrouter" && !modelName.endsWith(":free"))
    )
      throw new DomainError("CONFIGURATION_REQUIRED");
  }
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
        const jsonInstruction = options.json
          ? `\nReturn only one complete JSON object, no markdown or reasoning.${options.responseSchema ? ` Required JSON Schema: ${JSON.stringify(options.responseSchema.schema)}` : ""}`
          : "";
        const supportsJson =
          this.provider === "nvidia" ||
          this.modelName === "google/gemma-4-31b-it:free";
        const body = {
          model: this.modelName,
          messages: [
            { role: "system", content: system + jsonInstruction },
            ...messages,
          ],
          max_tokens: maximum,
          temperature: 0.2,
          stream: false,
          ...(options.json && supportsJson
            ? { response_format: { type: "json_object" } }
            : {}),
          ...(this.provider === "openrouter"
            ? {
                provider: { allow_fallbacks: false },
                reasoning: { enabled: false, exclude: true },
              }
            : { chat_template_kwargs: { enable_thinking: false } }),
        };
        aiDebug("provider.request", {
          model: this.modelName,
          purpose: options.purpose ?? "chat",
          messageCount: messages.length,
          inputCharacters:
            system.length +
            jsonInstruction.length +
            messages.reduce((sum, m) => sum + m.content.length, 0),
        });
        // Reviewed multi-finding drafts take longer on the selected development
        // model than ordinary replies. Keep one bounded request, without retrying.
        const deadline = AbortSignal.timeout(
          options.purpose === "clinician" ? 90000 : 45000,
        );
        const signal = options.signal
          ? AbortSignal.any([options.signal, deadline])
          : deadline;
        try {
          signal.throwIfAborted();
          this.observedUsage.requests++;
          const response = await fetch(urls[this.provider], {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal,
            cache: "no-store",
            redirect: "error",
          });
          aiDebug("provider.http", {
            upstreamStatus: response.status,
            attempt: 1,
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new DomainError(
              response.status === 429
                ? "RATE_LIMITED"
                : [401, 403].includes(response.status)
                  ? "CONFIGURATION_REQUIRED"
                  : "PROVIDER_UNAVAILABLE",
            );
          }
          const result = completion.safeParse(await payload(response));
          if (!result.success || result.data.error)
            throw new DomainError("PROVIDER_UNAVAILABLE");
          this.observedUsage.responses++;
          if (result.data.usage) {
            this.observedUsage.usageResponses++;
            this.observedUsage.promptTokens += result.data.usage.prompt_tokens;
            this.observedUsage.completionTokens +=
              result.data.usage.completion_tokens;
            this.observedUsage.totalTokens += result.data.usage.total_tokens;
          }
          aiDebug("provider.response", {
            model: this.modelName,
            finishReason: "stop",
            promptTokenCount: result.data.usage?.prompt_tokens,
            candidatesTokenCount: result.data.usage?.completion_tokens,
            totalTokenCount: result.data.usage?.total_tokens,
          });
          const text = result.data.choices[0].message.content;
          if (/<\/?(?:think|reasoning)\b/i.test(text))
            throw new DomainError("PROVIDER_UNAVAILABLE");
          if (options.json) {
            try {
              const value: unknown = JSON.parse(text);
              if (!value || typeof value !== "object" || Array.isArray(value))
                throw Error();
            } catch {
              throw new DomainError("PROVIDER_UNAVAILABLE");
            }
          }
          aiDebug("provider.output.ready", {
            model: this.modelName,
            outputCharacters: text.length,
          });
          return text;
        } catch (error) {
          if (error instanceof DomainError) throw error;
          const candidate = error as { cause?: { code?: unknown } };
          const code = candidate?.cause?.code;
          aiDebug("provider.transport.failed", {
            reason: options.signal?.aborted
              ? "cancelled"
              : deadline.aborted
                ? "timeout"
                : "network",
            ...(typeof code === "string" &&
            [
              "UND_ERR_CONNECT_TIMEOUT",
              "ECONNRESET",
              "ETIMEDOUT",
              "ENOTFOUND",
              "EAI_AGAIN",
            ].includes(code)
              ? { code }
              : {}),
          });
          throw new DomainError("PROVIDER_UNAVAILABLE");
        }
      },
    );
  }
}
