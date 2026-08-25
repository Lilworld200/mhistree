/**
 * OpenRouter Provider Adapter for Mhistree Gateway
 * ─────────────────────────────────────────────────────────────────
 * Implements the LLMProvider interface (lib/ai/types.ts).
 * Connects to OpenRouter's OpenAI-compatible API gateway.
 *
 * Supports streaming, non-streaming, structured output, and embeddings.
 */
import { createOpenAI } from "@ai-sdk/openai";
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

// ── OpenRouter Client ────────────────────────────────────────────────────────
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  headers: {
    "HTTP-Referer": "https://mhistree.app",
    "X-Title": "Mhistree Health AI",
  },
});

const DEFAULT_MODEL =
  process.env.AI_PATIENT_MODEL ||
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";

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

export class OpenRouterProvider implements LLMProvider {
  readonly id = "openrouter";
  private readonly defaultModel: string;

  constructor(model?: string) {
    this.defaultModel = model || DEFAULT_MODEL;
  }

  // ── Non-streaming Chat ─────────────────────────────────────────────────────
  async chat(input: ChatRequest): Promise<ChatResponse> {
    const modelId = input.model || this.defaultModel;
    const { system, coreMessages } = extractPromptParts(input.messages);

    const result = await generateText({
      model: openrouter(modelId),
      system,
      messages: coreMessages,
      temperature: input.temperature ?? 0.7,
      maxOutputTokens: input.maxTokens,
    });

    return {
      text: result.text,
      provider: "openrouter",
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
      model: openrouter(modelId),
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
      model: openrouter(modelId),
      prompt: input.prompt,
      schema:
        (input.schema as z.ZodType<unknown>) ||
        z.record(z.string(), z.unknown()),
      schemaName: "structured_output",
      // Some OpenRouter models (e.g. free MiniMax tiers) ignore
      // response_format and wrap their JSON in prose or ```json fences.
      // Repair by slicing to the outermost JSON object before parsing.
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
  // Routes through OpenRouter's OpenAI-compatible POST /embeddings endpoint,
  // so the SAME OPENROUTER_API_KEY serves chat + extraction + embeddings.
  // Model & expected vector dimensions come from getEmbeddingInfo() — swap
  // models via AI_EMBEDDING_MODEL / AI_EMBEDDING_DIMENSIONS in .env only.
  async embed(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    const info = getEmbeddingInfo();
    const texts = Array.isArray(input.input) ? input.input : [input.input];
    const modelId = input.model || info.model;

    const res = await fetch(`${info.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://mhistree.app",
        "X-Title": "Mhistree Health AI",
      },
      body: JSON.stringify({
        model: modelId,
        input: texts,
        dimensions: info.dimensions,
        encoding_format: "float",
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `Embedding request failed (HTTP ${res.status} from ${info.baseUrl}, model ${modelId}): ${detail.slice(0, 300)}`,
      );
    }

    const json = (await res.json()) as {
      data?: { index?: number; embedding: number[] }[];
    };
    const vectors = [...(json.data ?? [])]
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((row) => row.embedding);

    if (vectors.length === 0) {
      throw new Error(
        `Embedding response contained no vectors (model ${modelId})`,
      );
    }

    // Guard the pgvector contract early with an actionable message instead of
    // failing later at insert time with a cryptic dimension mismatch.
    const dims = vectors[0]?.length ?? 0;
    if (dims !== info.dimensions) {
      throw new Error(
        `Embedding model "${modelId}" returned ${dims}-dim vectors but the database expects ${info.dimensions}. ` +
          `Set AI_EMBEDDING_DIMENSIONS=${dims} in .env and re-provision pgvector columns ` +
          `(see supabase/migrations/003_embedding_dimensions.sql), then re-embed stored documents.`,
      );
    }

    return { vectors, model: modelId, dimensions: dims };
  }

  // ── Provider Health Check ──────────────────────────────────────────────────
  async healthCheck() {
    const t0 = Date.now();
    try {
      await generateText({
        model: openrouter(this.defaultModel),
        messages: [{ role: "user" as const, content: "ping" }],
        maxOutputTokens: 5,
      });
      return { ok: true, latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, detail: String(err) };
    }
  }
}

/** Instantiates OpenRouter Provider Adapter */
export function createOpenRouterProvider(model?: string): LLMProvider {
  return new OpenRouterProvider(model);
}
