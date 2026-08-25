-- ═══════════════════════════════════════════════════════════════════════════
-- 004_embedding_dimensions_768.sql
--
-- Re-provisions pgvector for the active embedding stack:
--   gemini-embedding-001 (Google, direct) requested at 768 dims via
--   outputDimensionality (Matryoshka truncation).
-- The schema previously assumed OpenRouter Nemotron embeddings at 1536.
--
-- If any rows already exist in medical_document_chunks embedded at a larger
-- dimension, this ALTER will error — clear them first:
--   DELETE FROM public.medical_document_chunks;
--   then re-run this file and re-upload/re-embed those documents.
--
-- Idempotent. Safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- Shrink the column to the provisioned dimensionality (no-op if already 768)
ALTER TABLE public.medical_document_chunks
  ALTER COLUMN embedding TYPE vector(768);

-- HNSW index must be rebuilt after a type change
DROP INDEX IF EXISTS public.idx_doc_chunks_hnsw;
CREATE INDEX IF NOT EXISTS idx_doc_chunks_hnsw ON public.medical_document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Match the RPC signature to the provisioned dimensionality
CREATE OR REPLACE FUNCTION public.match_medical_chunks(
  query_embedding  vector(768),
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
