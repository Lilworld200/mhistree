/**
 * OpenRouter Provider Adapter for Mhistree Gateway
 * ─────────────────────────────────────────────────────────────────
 * Implements the LLMProvider interface (lib/ai/types.ts).
 * Connects to OpenRouter's OpenAI-compatible API gateway.
 *
 * Supports streaming, non-streaming, structured output, and embeddings.
 */
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText, generateObject, embed } from "ai";
import { z } from "zod";
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

// ── Direct OpenAI Client for Vector Embeddings ──────────────────────────────
const openaiDirect = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || "",
});

const DEFAULT_MODEL =
  process.env.AI_PATIENT_MODEL ||
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
const EMBEDDING_MODEL =
  process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small";

type CoreMsg = { role: "system" | "user" | "assistant"; content: string };

function toCoreMessages(msgs: ChatRequest["messages"]): CoreMsg[] {
  return msgs.map((m) => ({ role: m.role, content: m.content }));
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
    const result = await generateText({
      model: openrouter(modelId),
      messages: toCoreMessages(input.messages),
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
    const result = streamText({
      model: openrouter(modelId),
      messages: toCoreMessages(input.messages),
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
      schema: z.record(z.string(), z.unknown()),
    });
    return input.validate(result.object);
  }

  // ── Vector Embedding Generation ───────────────────────────────────────────
  async embed(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    const texts = Array.isArray(input.input) ? input.input : [input.input];
    const vectors: number[][] = [];

    for (const text of texts) {
      const result = await embed({
        model: openaiDirect.textEmbeddingModel(
          (input.model || EMBEDDING_MODEL) as Parameters<
            typeof openaiDirect.textEmbeddingModel
          >[0],
        ),
        value: text,
      });
      vectors.push(result.embedding);
    }

    return {
      vectors,
      model: input.model || EMBEDDING_MODEL,
      dimensions: vectors[0]?.length ?? 1536,
    };
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
