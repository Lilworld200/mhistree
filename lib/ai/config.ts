/**
 * Provider/model configuration — separate concerns so any axis can change
 * via env only (idea_scaffold.md §7–§8). Never hard-code model ids.
 */

export type AiPurpose =
  | "patientConversation"
  | "clinicianAssistant"
  | "extraction"
  | "summarization"
  | "embeddings";

export const aiConfig: Record<
  AiPurpose,
  { provider: string; model: string; apiKeyEnv: string }
> = {
  patientConversation: {
    provider: process.env.AI_PROVIDER ?? "openrouter",
    model: process.env.AI_PATIENT_MODEL ?? "",
    apiKeyEnv: "AI_API_KEY",
  },
  clinicianAssistant: {
    provider: process.env.AI_CLINICIAN_PROVIDER ?? process.env.AI_PROVIDER ?? "openrouter",
    model: process.env.AI_CLINICIAN_MODEL ?? "",
    apiKeyEnv: "AI_CLINICIAN_API_KEY",
  },
  extraction: {
    provider: process.env.AI_EXTRACTION_PROVIDER ?? process.env.AI_PROVIDER ?? "openrouter",
    model: process.env.AI_EXTRACTION_MODEL ?? "",
    apiKeyEnv: "AI_EXTRACTION_API_KEY",
  },
  summarization: {
    provider: process.env.AI_SUMMARY_PROVIDER ?? process.env.AI_PROVIDER ?? "openrouter",
    model: process.env.AI_SUMMARY_MODEL ?? "",
    apiKeyEnv: "AI_API_KEY",
  },
  // Embedding model is an INDEPENDENT dependency (§8). If it changes,
  // re-embed and version vectors: embedding_model + dimensions + version.
  embeddings: {
    provider: process.env.AI_EMBEDDING_PROVIDER ?? process.env.AI_PROVIDER ?? "openrouter",
    model: process.env.AI_EMBEDDING_MODEL ?? "",
    apiKeyEnv: "OPENROUTER_API_KEY",
  },
};

// ── Embedding configuration — single source of truth ─────────────────────────
// Swap embedding models by changing AI_EMBEDDING_MODEL / AI_EMBEDDING_DIMENSIONS
// in .env. If the new model outputs a different vector size, also re-provision
// pgvector columns: supabase/migrations/003_embedding_dimensions.sql.
// NOTE: pgvector HNSW indexes cap at 2000 dims — keep dimensions ≤ 2000
// (Matryoshka models like Nemotron Embed accept truncation via `dimensions`).
const DEFAULT_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

/**
 * getEmbeddingInfo()
 * Reports which embedding model is in use, which API serves it, and the
 * vector dimensionality the database must be provisioned for.
 *
 * @example
 *   const info = getEmbeddingInfo();
 *   // → { provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1",
 *   //     model: "nvidia/llama-nemotron-embed-vl-1b-v2:free",
 *   //     dimensions: 2048, apiKeyEnv: "OPENROUTER_API_KEY" }
 */
export function getEmbeddingInfo() {
  return {
    provider: aiConfig.embeddings.provider,
    api: "openai-compatible POST {baseUrl}/embeddings",
    baseUrl:
      process.env.AI_EMBEDDING_BASE_URL ?? "https://openrouter.ai/api/v1",
    model: aiConfig.embeddings.model || DEFAULT_EMBEDDING_MODEL,
    dimensions: Number(
      process.env.AI_EMBEDDING_DIMENSIONS ?? DEFAULT_EMBEDDING_DIMENSIONS,
    ),
    apiKeyEnv: aiConfig.embeddings.apiKeyEnv,
  };
}
