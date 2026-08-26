-- ===========================================================================
-- Mhistree Database Migration — 007_medication_lifecycle.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds lifecycle_metadata JSONB to the medications table. Populated by
-- lib/server/medication-persistence.ts whenever a medication's life-cycle
-- status transitions (active → discontinued | completed, or a resume back to
-- active). Nothing is ever deleted: the row keeps its full history with
-- provenance (who declared the change, why, how certain we are, and the
-- patient's own words as evidence).
--
-- Example shape written by the app:
-- {
--   "event": "discontinued",
--   "reason": "Malaria infection has resolved",
--   "confirmed_by": "doctor",
--   "confirmation_strength": 0.9,
--   "evidence_message": "my doctor just confirmed that my malaria is gone…",
--   "recorded_at": "2026-08-26T12:00:00.000Z"
-- }
--
-- Run ONCE in Supabase Dashboard → SQL Editor on the live database.
-- ===========================================================================

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS lifecycle_metadata JSONB;
