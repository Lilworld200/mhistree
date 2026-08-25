/**
 * Mhistree LLM Gateway — Central provider registry and abstraction gateway.
 * Everything in the application calls: ai.chat / ai.stream / ai.structured / ai.embed.
 *
 * Provider configuration is controlled via environment variables (aiConfig).
 * Switching providers requires ZERO code changes in feature code.
 */
import { aiConfig, type AiPurpose } from "./config";
import { createOpenRouterProvider } from "./providers/openrouter";
import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  LLMProvider,
  StructuredRequest,
} from "./types";

// ── Provider Registry ────────────────────────────────────────────────────────
const providerFactories: Record<string, () => LLMProvider> = {
  openrouter: () => createOpenRouterProvider(),
};

// Singleton cache for active provider instances
const providerCache = new Map<string, LLMProvider>();

function resolveProvider(purpose: AiPurpose): LLMProvider {
  const { provider, model } = aiConfig[purpose];
  const cacheKey = `${provider}:${model}`;

  if (providerCache.has(cacheKey)) {
    return providerCache.get(cacheKey)!;
  }

  const factory = providerFactories[provider] || providerFactories.openrouter;
  const instance = factory();
  providerCache.set(cacheKey, instance);
  return instance;
}

// ── Public Gateway API ────────────────────────────────────────────────────────

export const ai = {
  /** Non-streaming text generation */
  async chat(purpose: AiPurpose, input: ChatRequest): Promise<ChatResponse> {
    const provider = resolveProvider(purpose);
    const modelOverride = aiConfig[purpose].model || undefined;
    return provider.chat({ ...input, model: input.model ?? modelOverride });
  },

  /** Streaming text generation (returns AsyncIterable of ChatChunk deltas) */
  stream(purpose: AiPurpose, input: ChatRequest) {
    const provider = resolveProvider(purpose);
    const modelOverride = aiConfig[purpose].model || undefined;
    return provider.stream({ ...input, model: input.model ?? modelOverride });
  },

  /** Structured Zod schema extraction */
  async structured<T>(
    purpose: AiPurpose,
    input: StructuredRequest<T>,
  ): Promise<T> {
    const provider = resolveProvider(purpose);
    const modelOverride = aiConfig[purpose].model || undefined;
    return provider.structured<T>({
      ...input,
      model: input.model ?? modelOverride,
    });
  },

  /** Vector embedding generation */
  async embed(input: EmbeddingRequest): Promise<EmbeddingResponse> {
    const provider = resolveProvider("embeddings");
    if (!provider.embed) {
      throw new Error(
        `Configured provider "${provider.id}" does not support embeddings`,
      );
    }
    return provider.embed(input);
  },

  /** Gateway health check */
  async health(purpose: AiPurpose = "patientConversation") {
    const provider = resolveProvider(purpose);
    if (!provider.healthCheck) return { ok: true };
    return provider.healthCheck();
  },
};
