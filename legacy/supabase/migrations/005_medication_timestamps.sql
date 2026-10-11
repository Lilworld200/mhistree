-- ===========================================================================
-- Mhistree Database Migration — 005_medication_timestamps.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds created_at / updated_at timestamps to the medications table.
--
-- Fixes Postgres error 42703 ("column medications.created_at does not exist")
-- raised by app/api/timeline/route.ts which selects and orders by created_at.
--
--   created_at: when the medication row was first recorded
--               (defaults to now() so pre-existing rows are backfilled)
--   updated_at: refreshed whenever an extraction overrides/corrects the row
--               (kept current by trigger med_touch_updated_at below)
--
-- Run ONCE in Supabase Dashboard → SQL Editor on the live database.
-- ===========================================================================

ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Keep updated_at current on every UPDATE without app-side bookkeeping.
CREATE OR REPLACE FUNCTION public.set_medication_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS med_touch_updated_at ON public.medications;
CREATE TRIGGER med_touch_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_medication_updated_at();
