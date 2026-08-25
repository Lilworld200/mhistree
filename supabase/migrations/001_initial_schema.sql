-- ===========================================================================
-- Mhistree Database Migration — Run in Supabase SQL Editor (in order)
-- Project: mhistree | Generated: 2026-08-25
-- ===========================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: RAG embeddings
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- Trigram: fast medical text search

-- ===========================================================================
-- TABLE 1: users (patients + clinicians unified identity store)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_name        TEXT        NOT NULL,
  last_name         TEXT        NOT NULL,
  other_names       TEXT,
  email             TEXT        NOT NULL UNIQUE,
  phone_number      TEXT,
  date_of_birth     DATE,
  emergency_contact JSONB
);

-- Index for fast email lookup (auth join)
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- ===========================================================================
-- TABLE 2: health_profiles (clinical baseline: blood group, allergies, etc.)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.health_profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blood_group           VARCHAR(5),
  genotype              VARCHAR(5),
  height                VARCHAR(10),
  weight                VARCHAR(10),
  allergies             TEXT,
  chronic_conditions    TEXT,
  family_history        TEXT,
  lifestyle             TEXT,
  gender                VARCHAR(20),
  primary_physician_id  UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_profiles_user ON public.health_profiles (user_id);

-- ===========================================================================
-- TABLE 3: health_vitals (time-series biometric readings)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.health_vitals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  vital_type    VARCHAR(50) NOT NULL,  -- blood_pressure, heart_rate, glucose, weight, temperature, oxygen_saturation
  numeric_value NUMERIC,
  text_value    TEXT,
  unit          VARCHAR(20),
  source        VARCHAR(30) NOT NULL DEFAULT 'patient_reported'  -- patient_reported | device_sync | clinician_entry
);

CREATE INDEX IF NOT EXISTS idx_vitals_patient_time ON public.health_vitals (patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_vitals_type ON public.health_vitals (vital_type);

-- ===========================================================================
-- TABLE 4: health_practitioners (clinician professional profile)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.health_practitioners (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  professional_id   VARCHAR(50) NOT NULL,
  professional_type VARCHAR(50) NOT NULL,  -- doctor | nurse | pharmacist | therapist
  specialization    VARCHAR(100),
  license_number    VARCHAR(50),
  practice_name     VARCHAR(100),
  practice_address  TEXT,
  practice_phone    VARCHAR(20),
  practice_email    VARCHAR(100),
  is_verified       BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practitioners_user ON public.health_practitioners (user_id);

-- ===========================================================================
-- TABLE 5: medications (active + discontinued prescriptions, RxNorm aligned)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.medications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rxnorm_code   VARCHAR(20),
  drug_name     TEXT        NOT NULL,
  dosage        TEXT        NOT NULL,
  frequency     TEXT        NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | discontinued | completed
  prescribed_by UUID        REFERENCES public.users(id),
  started_at    DATE,
  ended_at      DATE
);

CREATE INDEX IF NOT EXISTS idx_medications_patient ON public.medications (patient_id, status);

-- ===========================================================================
-- TABLE 6: health_memories (longitudinal EHR — dual-contributor)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.health_memories (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id               UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contributor_role         VARCHAR(20)  NOT NULL,   -- patient | clinician | ai_extractor
  contributor_id           UUID,
  fact_category            VARCHAR(50)  NOT NULL,   -- allergy | chronic_condition | family_history | lifestyle | symptom_trend | surgery | vaccination
  fact_summary             TEXT         NOT NULL,
  snomed_code              VARCHAR(30),
  icd10_code               VARCHAR(30),
  confidence_score         NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  is_verified              BOOLEAN      NOT NULL DEFAULT false,
  verified_by_clinician_id UUID         REFERENCES public.users(id),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_patient ON public.health_memories (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_category ON public.health_memories (patient_id, fact_category);
CREATE INDEX IF NOT EXISTS idx_memories_unverified ON public.health_memories (patient_id, is_verified) WHERE is_verified = false;
-- Trigram index for fast full-text memory search
CREATE INDEX IF NOT EXISTS idx_memories_trgm ON public.health_memories USING gin (fact_summary gin_trgm_ops);

-- ===========================================================================
-- TABLE 7: chat_sessions
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  session_group VARCHAR(30) NOT NULL DEFAULT 'Today',  -- Today | Yesterday | Previous 7 days | Older
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON public.chat_sessions (patient_id, updated_at DESC);

-- ===========================================================================
-- TABLE 8: chat_messages
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL,  -- user | assistant | system | clinician_note
  content     TEXT        NOT NULL,
  tokens_used INT         NOT NULL DEFAULT 0,
  attachments JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON public.chat_messages (session_id, created_at ASC);
-- Trigram index for full-text message search
CREATE INDEX IF NOT EXISTS idx_messages_trgm ON public.chat_messages USING gin (content gin_trgm_ops);

-- ===========================================================================
-- TABLE 9: user_summaries (AI-generated longitudinal health summaries + versioning)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.user_summaries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  summary      TEXT        NOT NULL,
  key_metadata JSONB,
  version      VARCHAR(20) NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_summaries_user ON public.user_summaries (user_id, created_at DESC);

-- ===========================================================================
-- TABLE 10: medical_document_chunks (pgvector RAG store)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.medical_document_chunks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_name TEXT        NOT NULL,
  file_url      TEXT        NOT NULL,
  chunk_index   INT         NOT NULL,
  chunk_text    TEXT        NOT NULL,
  embedding     vector(1536),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HNSW index for ultra-fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_doc_chunks_hnsw ON public.medical_document_chunks 
  USING hnsw (embedding vector_cosine_ops);

-- ===========================================================================
-- TABLE 11: audit_logs (HIPAA compliance audit trail)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID        NOT NULL,
  actor_role VARCHAR(20) NOT NULL,  -- patient | clinician | system
  action     VARCHAR(80) NOT NULL,  -- view_timeline | verify_memory | export_ehr | login | logout
  patient_id UUID        REFERENCES public.users(id),
  ip_address TEXT,
  metadata   JSONB,
  timestamp  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_patient ON public.audit_logs (patient_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs (actor_id, timestamp DESC);

-- ===========================================================================
-- FUNCTION: match_medical_chunks
-- Hybrid vector + keyword similarity search for RAG retrieval
-- ===========================================================================
CREATE OR REPLACE FUNCTION match_medical_chunks(
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

-- ===========================================================================
-- ROW LEVEL SECURITY (RLS) — Enable on all patient-data tables
-- ===========================================================================
ALTER TABLE public.users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_vitals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_practitioners    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_memories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_summaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs              ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies: Users can only read/write their own data ───────────────────
-- (Clinicians with shared access require a separate policy — added in Step 6)

CREATE POLICY "users_own_row" ON public.users
  FOR ALL USING (auth.uid()::text = id::text);

CREATE POLICY "health_profile_own" ON public.health_profiles
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "vitals_own" ON public.health_vitals
  FOR ALL USING (auth.uid()::text = patient_id::text);

CREATE POLICY "medications_own" ON public.medications
  FOR ALL USING (auth.uid()::text = patient_id::text);

CREATE POLICY "memories_own" ON public.health_memories
  FOR ALL USING (auth.uid()::text = patient_id::text);

CREATE POLICY "sessions_own" ON public.chat_sessions
  FOR ALL USING (auth.uid()::text = patient_id::text);

CREATE POLICY "messages_via_session" ON public.chat_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.patient_id::text = auth.uid()::text
    )
  );

CREATE POLICY "summaries_own" ON public.user_summaries
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY "doc_chunks_own" ON public.medical_document_chunks
  FOR ALL USING (auth.uid()::text = patient_id::text);

-- Audit logs: actors can read their own logs; service_role has full access
CREATE POLICY "audit_own_actor" ON public.audit_logs
  FOR SELECT USING (auth.uid()::text = actor_id::text);
