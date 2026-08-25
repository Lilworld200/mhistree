/**
 * Medical RAG Vector Search Service (`lib/ai/rag.ts`)
 * ─────────────────────────────────────────────────────────────────
 * Generates embeddings via LLM Gateway and performs vector cosine
 * similarity search across medical document chunks in pgvector.
 */
import { ai } from "./gateway";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export interface MatchedChunk {
  id: string;
  document_name: string;
  chunk_text: string;
  similarity: number;
}

/**
 * Split text into semantic chunks (~500 chars with 50 char overlap)
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Ingest document text into pgvector for a patient
 */
export async function ingestDocumentChunks(
  patientId: string,
  documentName: string,
  fileUrl: string,
  rawText: string,
): Promise<{ chunkCount: number }> {
  const chunks = chunkText(rawText);
  if (chunks.length === 0) return { chunkCount: 0 };

  // Generate vector embeddings via Gateway
  const embeddingRes = await ai.embed({ input: chunks });
  const supabase = createAdminSupabaseClient();

  const rows = chunks.map((chunk, i) => ({
    patient_id: patientId,
    document_name: documentName,
    file_url: fileUrl,
    chunk_index: i,
    chunk_text: chunk,
    embedding: JSON.stringify(embeddingRes.vectors[i]),
  }));

  const { error } = await supabase.from("medical_document_chunks").insert(rows);

  if (error) {
    throw new Error(`Failed to store document chunks: ${error.message}`);
  }

  return { chunkCount: chunks.length };
}

/**
 * Perform cosine similarity vector search over patient's medical documents
 */
export async function searchMedicalChunks(
  patientId: string,
  query: string,
  matchCount = 5,
): Promise<MatchedChunk[]> {
  const queryEmbeddingRes = await ai.embed({ input: query });
  const queryVector = queryEmbeddingRes.vectors[0];

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase.rpc("match_medical_chunks", {
    query_embedding: JSON.stringify(queryVector),
    match_patient_id: patientId,
    match_count: matchCount,
  });

  if (error) {
    console.error("RPC match_medical_chunks error:", error);
    return [];
  }

  return (data as MatchedChunk[]) || [];
}
