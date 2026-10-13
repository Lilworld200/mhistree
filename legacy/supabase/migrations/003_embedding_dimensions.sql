-- ═══════════════════════════════════════════════════════════════════════════
-- 003_embedding_dimensions.sql
--
-- Aligns pgvector provisioning with the active embedding model:
--   nvidia/llama-nemotron-embed-vl-1b-v2 (via OpenRouter)
-- requested at AI_EMBEDDING_DIMENSIONS=1536 via the API `dimensions` param
-- (Matryoshka truncation).
--
-- Why 1536 and not the model's native 2048? pgvector HNSW indexes support a
-- maximum of 2000 dimensions (error 54000). Truncating to 1536 keeps native
-- HNSW + cosine search with negligible retrieval-quality loss.
--
-- Idempotent: also repairs databases left mid-patched by the earlier 2048
-- attempt (column widened to vector(2048) and its HNSW index dropped).
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure the column is vector(1536) (no-op if already 1536)
ALTER TABLE public.medical_document_chunks
  ALTER COLUMN embedding TYPE vector(1536);

-- Recreate the HNSW index (restores the one dropped by the failed patch)
DROP INDEX IF EXISTS public.idx_doc_chunks_hnsw;
CREATE INDEX IF NOT EXISTS idx_doc_chunks_hnsw ON public.medical_document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Match the RPC signature to the provisioned dimensionality
CREATE OR REPLACE FUNCTION public.match_medical_chunks(
  query_embedding  vector(1536),
  match_patient_id UUID,
  match_count      INT DEFAULT 5
)
RETURNS TABLE (
  id            UUID,
  document_name TEXT,
  chunk_text    TEXT,
  similarity    FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    mc.id,
    mc.document_name,
    mc.chunk_text,
    1 - (mc.embedding <=> query_embedding) AS similarity
  FROM public.medical_document_chunks mc
  WHERE mc.patient_id = match_patient_id
    AND mc.embedding IS NOT NULL
  ORDER BY mc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
