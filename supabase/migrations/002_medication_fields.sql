-- ===========================================================================
-- Mhistree Database Migration — 002_medication_fields.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds trust_score and inferred_by columns to the medications table.
--
-- trust_score: 0.00–100.00 (AI's confidence % that this is the correct drug
--              and regimen for the patient, based on conversation evidence)
-- inferred_by: who/what determined the medication
--              'doctor' | 'ai_inferred' | 'self_reported' | 'pharmacist'
--
-- Run ONCE in Supabase Dashboard → SQL Editor on the live database.
-- ===========================================================================

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS trust_score  NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS inferred_by  VARCHAR(30)  DEFAULT NULL;
