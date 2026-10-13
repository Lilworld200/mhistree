-- ===========================================================================
-- Mhistree Database Migration — 006_summaries_and_derived_profile.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extends user_summaries into the two-tier rolling summary store:
--      scope = 'chat_session' → per-session rolling recaps (episodic memory)
--      scope = 'user'         → longitudinal "current health state" digest
--    Append-only versioning: every roll INSERTs a new row; readers take the
--    latest row per (scope, session_id) ordered by created_at DESC.
--
-- 2. Adds health_profiles.derived_health JSONB: two-tier AI-derived condition
--    store (CONFIRMED / DETERMINED) maintained by lib/server/profile-sync.ts.
--    Manual text columns stay user-owned; CONFIRMED entries are union-merged
--    into chronic_conditions / allergies text without clobbering manual edits.
--
-- Run ONCE in Supabase Dashboard → SQL Editor on the live database.
-- ===========================================================================

-- ── 1. Two-tier rolling summaries ───────────────────────────────────────────
ALTER TABLE public.user_summaries
  ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS summarized_through_message_id UUID REFERENCES public.chat_messages(id),
  ADD COLUMN IF NOT EXISTS source_cursor JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Reader lookup: latest row per (user, scope, session).
CREATE INDEX IF NOT EXISTS idx_summaries_lookup
  ON public.user_summaries (user_id, scope, session_id, created_at DESC);

-- ── 2. Derived two-tier health profile data ────────────────────────────────
ALTER TABLE public.health_profiles
  ADD COLUMN IF NOT EXISTS derived_health JSONB NOT NULL DEFAULT '{}'::jsonb;
