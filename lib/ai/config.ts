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
    apiKeyEnv: "AI_EMBEDDING_API_KEY",
  },
};
