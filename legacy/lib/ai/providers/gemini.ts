/**
 * Google Gemini Provider Adapter for Mhistree Gateway
 * ─────────────────────────────────────────────────────────────────
 * Implements the LLMProvider interface (lib/ai/types.ts).
 * Connects directly to Google's Generative Language API.
 *
 * Supports streaming, non-streaming, structured output, and embeddings.
 * Auth: GEMINI_API_KEY (sent as x-goog-api-key).
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText, generateObject } from "ai";
import { z } from "zod";
import { getEmbeddingInfo } from "../config";
import type {
  LLMProvider,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  StructuredRequest,
} from "../types";

// ── Gemini Client ────────────────────────────────────────────────────────────
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY || "",
});

const DEFAULT_MODEL =
  process.env.AI_PATIENT_MODEL || "gemini-3.1-flash-lite";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

type CoreMsg = { role: "user" | "assistant"; content: string };

function extractPromptParts(msgs: ChatRequest["messages"]) {
  const systemMsgs = msgs
    .filter((m) => m.role === "system")
    .map((m) => m.content);
  const system = systemMsgs.length ? systemMsgs.join("\n\n") : undefined;

  const coreMessages: CoreMsg[] = msgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  return { system, coreMessages };
}

export class GeminiProvider implements LLMProvider {
  readonly id = "gemini";
  private readonly defaultModel: string;

  constructor(model?: string) {
    this.defaultModel = model || DEFAULT_MODEL;
  }

  // ── Non-streaming Chat ─────────────────────────────────────────────────────
  async chat(input: ChatRequest): Promise<ChatResponse> {
    const modelId = input.model || this.defaultModel;
    const { system, coreMessages } = extractPromptParts(input.messages);

    const result = await generateText({
      model: google(modelId),
      system,
      messages: coreMessages,
      temperature: input.temperature ?? 0.7,
      maxOutputTokens: input.maxTokens,
    });

    return {
      text: result.text,
      provider: "gemini",
      model: modelId,
      usage: {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
      },
    };
  }

  // ── Streaming Chat (yields ChatChunk deltas) ──────────────────────────────
  async *stream(input: ChatRequest): AsyncIterable<ChatChunk> {
    const modelId = input.model || this.defaultModel;
    const { system, coreMessages } = extractPromptParts(input.messages);

    const result = streamText({
      model: google(modelId),
      system,
      messages: coreMessages,
      temperature: input.temperature ?? 0.7,
      maxOutputTokens: input.maxTokens,
    });

    for await (const chunk of result.textStream) {
      yield { delta: chunk };
    }
  }

  // ── Structured Output Generation ──────────────────────────────────────────
  async structured<T>(input: StructuredRequest<T>): Promise<T> {
    const modelId = input.model || this.defaultModel;
    const result = await generateObject({
      model: google(modelId),
      prompt: input.prompt,
      schema:
        (input.schema as z.ZodType<unknown>) ||
        z.record(z.string(), z.unknown()),
      schemaName: "structured_output",
      // Defensive repair: some models wrap JSON in prose or ```json fences.
      repairText: async ({ text }) => {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start === -1 || end === -1 || end <= start) return null;
        const sliced = text.slice(start, end + 1);
        return sliced === text ? null : sliced;
      },
    });
    return input.validate(result.object);
  }

  // ── Vector Embedding Generation ───────────────────────────────────────────
  // Uses the embedContent REST endpoint directly so we control the
  // outputDimensionality (Matryoshka truncation) that pgvector is provisioned
  // for — see getEmbeddingInfo() in config.ts. Calls run in parallel because
  // batchEmbedContent is not available to all Gemini API keys.
  async embed(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    const info = getEmbeddingInfo();
    const texts = Array.isArray(input.input) ? input.input : [input.input];
    const modelId = input.model || info.model;

    const apiKey = process.env.GEMINI_API_KEY ?? "";
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is not set — embeddings provider 'gemini' cannot authenticate",
      );
    }

    const embedOne = async (text: string): Promise<number[]> => {
      const res = await fetch(
        `${GEMINI_API_BASE}/models/${encodeURIComponent(modelId)}:embedContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: `models/${modelId}`,
            content: { parts: [{ text }] },
            outputDimensionality: info.dimensions,
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `Embedding request failed (HTTP ${res.status} from ${info.api}, model ${modelId}): ${detail.slice(0, 300)}`,
        );
      }
      const json = (await res.json()) as { embedding?: { values?: number[] } };
      const values = json.embedding?.values ?? [];
      if (values.length === 0) {
        throw new Error(
          `Embedding response contained no vector (model ${modelId})`,
        );
      }
      return values;
    };

    const vectors = await Promise.all(texts.map(embedOne));

    return { vectors, model: modelId, dimensions: vectors[0].length };
  }

  // ── Provider Health Check ──────────────────────────────────────────────────
  async healthCheck() {
    const t0 = Date.now();
    try {
      await generateText({
        model: google(this.defaultModel),
        messages: [{ role: "user" as const, content: "ping" }],
        maxOutputTokens: 5,
      });
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }
}

/** Instantiates Gemini Provider Adapter */
export function createGeminiProvider(model?: string): LLMProvider {
  return new GeminiProvider(model);
}
