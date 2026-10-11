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
// pgvector columns: supabase/migrations/004_embedding_dimensions_768.sql.
// NOTE: pgvector HNSW indexes cap at 2000 dims — keep dimensions ≤ 2000
// (Matryoshka models like gemini-embedding-001 accept truncation via
// outputDimensionality).
const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const DEFAULT_EMBEDDING_DIMENSIONS = 768;

/**
 * getEmbeddingInfo()
 * Reports which embedding provider/model is in use, which API serves it,
 * and the vector dimensionality the database must be provisioned for.
 *
 * @example
 *   const info = getEmbeddingInfo();
 *   // → { provider: "gemini", api: "google-generative-language embedContent",
 *   //     baseUrl: null, model: "gemini-embedding-001",
 *   //     dimensions: 768, apiKeyEnv: "GEMINI_API_KEY" }
 */
export function getEmbeddingInfo() {
  const provider = aiConfig.embeddings.provider;
  const isGemini = provider === "gemini";
  return {
    provider,
    api: isGemini
      ? "google-generative-language embedContent"
      : "openai-compatible POST {baseUrl}/embeddings",
    baseUrl: isGemini ? null : "https://openrouter.ai/api/v1",
    model: aiConfig.embeddings.model || DEFAULT_EMBEDDING_MODEL,
    dimensions: Number(
      process.env.AI_EMBEDDING_DIMENSIONS ?? DEFAULT_EMBEDDING_DIMENSIONS,
    ),
    apiKeyEnv: isGemini ? "GEMINI_API_KEY" : "OPENROUTER_API_KEY",
  };
}
