/**
 * Mhistree AI Provider Registry
 * ─────────────────────────────
 * Central, model-agnostic provider layer.
 * Swap models by changing an env var — zero code changes required in features.
 *
 * Supported providers (configure keys in .env):
 *   • OpenRouter (default) — routes to any model via OpenAI-compatible API
 *   • OpenAI     — direct gpt-4o / gpt-4o-mini / text-embedding-3-small
 *   • Anthropic  — claude-3-5-sonnet (optional fallback)
 *   • Ollama     — local offline medical models (meditron, biomistral)
 *
 * Task routing strategy:
 *   chat              → OpenRouter (configurable model)
 *   extraction        → Fast/cheap model for medical NLP entity extraction
 *   clinical_reasoning→ High-reasoning model for differential diagnosis
 *   embedding         → OpenAI text-embedding-3-small (1536 dims)
 *   vision            → Multimodal model for lab scans / document OCR
 */

import { createOpenAI } from "@ai-sdk/openai";

// ── OpenRouter: routes to any model via OpenAI-compatible API ─────────────────
// Docs: https://openrouter.ai/docs
const openrouter = createOpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
  headers: {
    "HTTP-Referer": "https://mhistree.app",
    "X-Title": "Mhistree Health AI",
  },
});

// ── Optional: Direct OpenAI (for embeddings — OpenRouter doesn't support them) ──
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// ── Model name constants ──────────────────────────────────────────────────────
// Change these env vars in .env to swap models without touching code:
//   OPENROUTER_CHAT_MODEL=openai/gpt-4o
//   OPENROUTER_EXTRACTION_MODEL=openai/gpt-4o-mini
//   OPENROUTER_REASONING_MODEL=anthropic/claude-3-5-sonnet
//   OPENROUTER_VISION_MODEL=openai/gpt-4o
//   EMBEDDING_MODEL=text-embedding-3-small

const MODELS = {
  chat: process.env.OPENROUTER_CHAT_MODEL || "openai/gpt-4o",
  extraction: process.env.OPENROUTER_EXTRACTION_MODEL || "openai/gpt-4o-mini",
  clinical_reasoning:
    process.env.OPENROUTER_REASONING_MODEL ||
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  vision: process.env.OPENROUTER_VISION_MODEL || "openai/gpt-4o",
  embedding: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
} as const;

// ── Task types ────────────────────────────────────────────────────────────────
export type ModelTask = keyof typeof MODELS;

/**
 * getModel(task, overrideModel?)
 * Returns the appropriate language model for a given task.
 *
 * @param task    - The AI task category (see MODELS above)
 * @param override- Optional explicit model string, e.g. "anthropic/claude-3-5-sonnet"
 *
 * @example
 *   const model = getModel("chat");
 *   const model = getModel("extraction", "openai/gpt-4o-mini");
 *   const model = getModel("clinical_reasoning", "ollama/meditron");
 */
export function getModel(task: ModelTask, override?: string) {
  const modelId = override ?? MODELS[task];

  // Local Ollama models — requires Ollama running at OLLAMA_BASE_URL
  if (modelId.startsWith("ollama/")) {
    try {
      // Lazy import to avoid loading ollama SDK for non-local deployments
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createOllama } = require("ollama-ai-provider");
      const ollamaClient = createOllama({
        baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/api",
      });
      return ollamaClient(modelId.replace("ollama/", ""));
    } catch {
      throw new Error(
        "Local Ollama provider requested but 'ollama-ai-provider' package is not installed. Please run 'npm install ollama-ai-provider' to enable local models.",
      );
    }
  }

  // All cloud models route through OpenRouter
  return openrouter(modelId);
}

/**
 * getEmbeddingModel()
 * Returns the embedding model instance for generating vector embeddings.
 * Always uses OpenAI directly (OpenRouter does not proxy embedding endpoints).
 *
 * @example
 *   const embedder = getEmbeddingModel();
 *   const { embedding } = await embed({ model: embedder, value: text });
 */
export function getEmbeddingModel() {
  return openai.textEmbeddingModel(MODELS.embedding);
}
