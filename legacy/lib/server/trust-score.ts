/**
 * Dynamic Trust Score for extracted medications
 * ────────────────────────────────────────────────
 * Deterministic, explainable 0–100 confidence % that this specific drug and
 * regimen is what the patient SHOULD be taking. Computed server-side from
 * how much was explicitly stated vs inferred, so scores are stable across
 * runs instead of varying with LLM sampling temperature.
 *
 *   base 20 (medication mentioned at all)
 *   +25 drug identified (generic name resolved, not "Unidentified …")
 *   +15 dosage/strength explicitly stated
 *   +15 frequency explicitly stated
 *   +10 duration/course length explicitly stated
 *    +15 source = doctor | +8 pharmacist | +5 self_reported | +0 ai_inferred
 *   capped at 100
 */

export interface TrustScoreMedInput {
  drug_name: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  inferred_by?: string | null;
}

const UNKNOWN_VALUES = new Set(["", "unknown", "unspecified", "n/a", "none"]);

const isKnown = (v?: string | null): boolean =>
  typeof v === "string" && !UNKNOWN_VALUES.has(v.trim().toLowerCase());

export const isIdentifiedDrug = (name: string): boolean =>
  Boolean(name) && !/^unidentified\b/i.test(name.trim());

const SOURCE_BONUS: Record<string, number> = {
  doctor: 15,
  pharmacist: 8,
  self_reported: 5,
  ai_inferred: 0,
};

export function computeTrustScore(med: TrustScoreMedInput): number {
  let score = 20;

  if (isIdentifiedDrug(med.drug_name)) score += 25;
  if (isKnown(med.dosage)) score += 15;
  if (isKnown(med.frequency)) score += 15;
  if (isKnown(med.duration)) score += 10;
  score += SOURCE_BONUS[(med.inferred_by ?? "").trim().toLowerCase()] ?? 0;

  return Math.min(100, score);
}
