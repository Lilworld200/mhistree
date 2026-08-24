import { aiConfig, type AiPurpose } from "./config";
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  StructuredRequest,
} from "./types";

/**
 * MHISTREE LLM GATEWAY — the ONLY module allowed to talk to providers.
 * Everything else calls: ai.chat / ai.stream / ai.structured / ai.embed.
 *
 * TODO (implementation order):
 *   1. Provider registry — import adapters from ./providers/* and map:
 *      { openrouter, openai, deepseek, gemini, anthropic, local }.
 *      Each adapter implements LLMProvider (./types.ts).
 *   2. resolveProvider(purpose) → pick adapter + model from aiConfig.
 *   3. Retry/timeout wrapper + structured request logging
 *      (provider, model, purpose, latency, tokens, request id) to the
 *      observability pipeline.
 *   4. Streaming pass-through as AsyncIterable<ChatChunk> for SSE routes.
 *   5. Health-check endpoint wiring for status surfaces ("AI temporarily
 *      unavailable" states in the UI).
 */

const providers: Record<string, LLMProvider | undefined> = {
  // openrouter: createOpenRouterProvider(),
  // openai: createOpenAICompatibleProvider({ baseURL: "https://api.openai.com/v1" }),
  // deepseek: createDeepSeekProvider(),
  // gemini: createGeminiProvider(),
  // anthropic: createAnthropicProvider(),
  // local: createLocalProvider(),
};

function resolveProvider(purpose: AiPurpose): LLMProvider {
  const { provider } = aiConfig[purpose];
  const impl = providers[provider];
  if (!impl) throw new Error(`AI provider "${provider}" is not registered yet`);
  return impl;
}

export const ai = {
  async chat(purpose: AiPurpose, input: ChatRequest): Promise<ChatResponse> {
    return resolveProvider(purpose).chat(input);
  },

  stream(purpose: AiPurpose, input: ChatRequest) {
    return resolveProvider(purpose).stream(input);
  },

  async structured<T>(
    purpose: AiPurpose,
    input: StructuredRequest<T>,
  ): Promise<T> {
    return resolveProvider(purpose).structured<T>(input);
  },

  async embed(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    const p = resolveProvider("embeddings");
    if (!p.embed) throw new Error("Configured provider cannot embed");
    return p.embed(input);
  },
};
