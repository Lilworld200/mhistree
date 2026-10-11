/**
 * Stable LLM Gateway contracts (idea_scaffold.md §5–§8).
 * The whole application depends on THESE types only — never on a
 * vendor SDK. Providers implement this interface behind gateway.ts.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Caller context for logging/metering, e.g. "patient-chat". */
  purpose?: string;
}

export interface ChatChunk {
  delta: string;
}

export interface ChatResponse {
  text: string;
  provider: string;
  model: string;
  requestId?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

import { z } from "zod";

export interface StructuredRequest<T> {
  prompt: string;
  /** Zod schema for structured output generation */
  schema?: z.ZodType<T>;
  /** Runtime validator (e.g. a zod .parse wrapper) enforced by the provider adapter. */
  validate: (value: unknown) => T;
  model?: string;
  purpose?: string;
}

export interface EmbeddingRequest {
  input: string | string[];
  model?: string;
}

export interface EmbeddingResponse {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface ProviderHealth {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
}

/** Capability-based provider interface. */
export interface LLMProvider {
  id: string;

  chat(input: ChatRequest): Promise<ChatResponse>;

  stream(input: ChatRequest): AsyncIterable<ChatChunk>;

  structured<T>(input: StructuredRequest<T>): Promise<T>;

  embed?(input: EmbeddingRequest): Promise<EmbeddingResponse>;

  healthCheck?(): Promise<ProviderHealth>;
}
