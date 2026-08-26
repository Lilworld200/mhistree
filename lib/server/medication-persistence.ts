/**
 * Medication persistence pipeline (shared by chat & extract-medical routes)
 * ─────────────────────────────────────────────────────────────────────────────
 * For each extracted medication:
 *
 *   1. Compute a deterministic trust_score (see lib/server/trust-score.ts).
 *   2. Upsert into `medications` keyed by lowercased drug_name:
 *        • insert when new and identified
 *        • override an existing row when the extraction carries MORE or NEWER
 *          information:
 *            – higher trust score than stored, OR
 *            – row previously "Unidentified …" is now identified, OR
 *            – a correction: any of dosage/frequency/status changed while
 *              trust is within ±10 of the stored value (user revising
 *              details keeps roughly the same evidence level)
 *   3. Dual-write into `health_memories` (fact_category = "medication") so
 *      /timeline surfaces it alongside other health facts — updated under
 *      the same override rules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MedicalExtraction } from "@/lib/ai/schemas/extraction";
import { computeTrustScore, isIdentifiedDrug } from "@/lib/server/trust-score";

/** Corrections accepted while trust is within this window of stored value. */
const CORRECTION_TRUST_TOLERANCE = 10;

type MedExtraction = MedicalExtraction["medications"][number];

interface ExistingMedRow {
  id: string;
  drug_name: string;
  dosage: string;
  frequency: string;
  status: string;
  trust_score: number | string | null;
  inferred_by: string | null;
  rxnorm_code: string | null;
}

const norm = (v: unknown): string =>
  typeof v === "string" ? v.trim().toLowerCase() : "";

/** Values the extractor uses for "not stated" — never written over real data. */
const UNKNOWN_VALUES = new Set(["", "unknown", "unspecified", "n/a", "none"]);
const isUnknownValue = (v: string | null | undefined): boolean =>
  v == null || UNKNOWN_VALUES.has(v.trim().toLowerCase());

const numTrust = (v: number | string | null | undefined): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? (n as number) : 0;
};

export async function persistExtractedMedications(
  db: SupabaseClient,
  patientId: string,
  meds: MedExtraction[],
  sourceWindow: { role: string; content: string }[],
): Promise<void> {
  if (meds.length === 0) return;

  // 1. Fetch ALL existing medications (any status) keyed by lowercase name.
  const { data: existingMeds, error: fetchErr } = await db
    .from("medications")
    .select(
      "id, drug_name, dosage, frequency, status, trust_score, inferred_by, rxnorm_code",
    )
    .eq("patient_id", patientId);

  if (fetchErr) {
    console.error("[Meds] existing medication fetch failed:", fetchErr);
    return;
  }

  const existingByName = new Map<string, ExistingMedRow>(
    ((existingMeds ?? []) as ExistingMedRow[]).map((r) => [
      r.drug_name.trim().toLowerCase(),
      r,
    ]),
  );

  for (const m of meds) {
    const trimmedName = m.drug_name.trim();
    if (!trimmedName) continue;

    const payload =
      m.clinical_payload && typeof m.clinical_payload === "object"
        ? (m.clinical_payload as Record<string, unknown>)
        : {};
    const brandName =
      typeof payload.brand_name === "string" ? payload.brand_name : null;

    // ── 2. medications table upsert ──
    const existing = existingByName.get(trimmedName.toLowerCase());

    // Sparse-safe merge: life-cycle mentions often restate ONLY the status.
    // "unknown" must never clobber stored regimen details, and trust is
    // scored on the MERGED regimen so sparse discontinuations are not
    // unfairly penalized by the tolerance gates.
    const effDosage = isUnknownValue(m.dosage)
      ? (existing?.dosage ?? m.dosage)
      : m.dosage;
    const effFrequency = isUnknownValue(m.frequency)
      ? (existing?.frequency ?? m.frequency)
      : m.frequency;
    const effDuration = isUnknownValue(m.duration)
      ? (existing ? "unknown" : m.duration) // duration is not stored on rows
      : m.duration;

    // Dynamic trust score — deterministic, replaces raw LLM guess.
    const trust = computeTrustScore({
      drug_name: trimmedName,
      dosage: effDosage,
      frequency: effFrequency,
      duration: effDuration,
      inferred_by: m.inferred_by,
    });

    const unidentifiedNow = !isIdentifiedDrug(trimmedName);

    // Life-cycle transitions (stopped / completed / resumed) are declared
    // facts of record: they override UNCONDITIONALLY, bypassing the trust-
    // tolerance gates that govern ordinary detail corrections.
    const lifecycleTransition =
      existing != null &&
      norm(existing.status) !== norm(m.status) &&
      norm(m.status) !== "";

    const lastUserMsg = [...sourceWindow]
      .reverse()
      .find((t) => t.role === "user");
    const buildLifecycleMetadata = () => ({
      event: m.status === "active" ? "resumed" : m.status,
      reason: m.status_change_reason || null,
      confirmed_by: m.status_change_by || "unknown",
      confirmation_strength: m.clarity_score,
      evidence_message: lastUserMsg?.content
        ? String(lastUserMsg.content).slice(0, 500)
        : null,
      recorded_at: new Date().toISOString(),
    });
    const todayIso = new Date().toISOString().slice(0, 10);

    if (existing) {
      const existingTrust = numTrust(existing.trust_score);
      const wasUnidentified = !isIdentifiedDrug(existing.drug_name);
      const corrected =
        norm(existing.dosage) !== norm(effDosage) ||
        norm(existing.frequency) !== norm(effFrequency) ||
        norm(existing.status) !== norm(m.status);
      const withinTolerance =
        trust >= existingTrust - CORRECTION_TRUST_TOLERANCE;

      const shouldOverride =
        lifecycleTransition ||
        trust > existingTrust ||
        (wasUnidentified && !unidentifiedNow) ||
        (corrected && withinTolerance && !unidentifiedNow);

      if (shouldOverride) {
        const { error } = await db
          .from("medications")
          .update({
            drug_name: trimmedName,
            dosage: effDosage,
            frequency: effFrequency,
            rxnorm_code: m.rxnorm_code ?? existing.rxnorm_code ?? null,
            status: m.status,
            trust_score: trust,
            inferred_by: m.inferred_by ?? existing.inferred_by ?? null,
            ended_at: m.status === "active" ? null : todayIso,
            ...(lifecycleTransition
              ? { lifecycle_metadata: buildLifecycleMetadata() }
              : {}),
          })
          .eq("id", existing.id);
        if (error) {
          console.error("[Meds] medication update failed:", error);
        } else {
          console.info(
            '[Meds] UPDATED "%s"%s (trust %d → %d, dosage=%s, frequency=%s, status=%s)',
            existing.drug_name,
            lifecycleTransition ? " [lifecycle-transition]" : "",
            existingTrust,
            trust,
            effDosage,
            effFrequency,
            m.status,
          );
        }
      } else {
        console.info(
          '[Meds] SKIPPED update for "%s" (stored trust %d >= new trust %d, no corrected fields)',
          existing.drug_name,
          existingTrust,
          trust,
        );
      }
    } else if (!unidentifiedNow) {
      const { error } = await db.from("medications").insert({
        patient_id: patientId,
        drug_name: trimmedName,
        dosage: effDosage,
        frequency: effFrequency,
        rxnorm_code: m.rxnorm_code || null,
        status: m.status,
        trust_score: trust,
        inferred_by: m.inferred_by ?? null,
        ended_at: m.status === "active" ? null : todayIso,
        ...(m.status !== "active"
          ? { lifecycle_metadata: buildLifecycleMetadata() }
          : {}),
      });
      if (error) {
        console.error("[Meds] medication insert failed:", error);
      } else {
        console.info(
          '[Meds] INSERTED "%s" (trust %d, dosage=%s, frequency=%s, inferred_by=%s)',
          trimmedName,
          trust,
          m.dosage,
          m.frequency,
          m.inferred_by ?? "n/a",
        );
      }
    }

    // ── 3. Dual-write into health_memories (category "medication") ──
    if (unidentifiedNow) {
      console.info('[Meds] skipped unidentified drug "%s"', trimmedName);
      continue;
    }

    const dosagePart = !isUnknownValue(effDosage) ? ` ${effDosage}` : "";
    const freqPart = !isUnknownValue(effFrequency)
      ? `, ${effFrequency}`
      : "";
    // Truthful life-cycle wording — the timeline must not claim the patient
    // is still taking a drug they just reported stopping.
    let memSummary: string;
    if (m.status === "discontinued") {
      memSummary = `Patient stopped taking ${trimmedName}${dosagePart}${freqPart}`;
    } else if (m.status === "completed") {
      memSummary = `Patient completed ${trimmedName} course${dosagePart}${freqPart}`;
    } else {
      memSummary = `Patient is taking ${trimmedName}${dosagePart}${freqPart}`;
    }
    if (
      m.status !== "active" &&
      m.status_change_reason &&
      m.status_change_reason.toLowerCase() !== "unknown"
    ) {
      memSummary += ` (${m.status_change_reason})`;
    }

    const { data: existingMemRows } = await db
      .from("health_memories")
      .select("id, fact_summary, clinical_payload")
      .eq("patient_id", patientId)
      .eq("fact_category", "medication")
      .ilike("fact_summary", `%${trimmedName}%`)
      .limit(1);

    const existingMem = existingMemRows?.[0] ?? null;
    const memPayload = {
      drug_name: trimmedName,
      ...(brandName ? { brand_name: brandName } : {}),
      status: m.status,
      dosage: effDosage,
      frequency: effFrequency,
      ...(m.duration && m.duration.toLowerCase() !== "unknown"
        ? { duration: m.duration }
        : {}),
      trust_score: trust,
      llm_trust_score: m.trust_score ?? null,
      inferred_by: m.inferred_by ?? null,
      rxnorm_code: m.rxnorm_code || null,
      ...(m.status !== "active"
        ? {
            lifecycle_event: m.status,
            status_change_reason: m.status_change_reason || null,
            status_change_by: m.status_change_by || "unknown",
          }
        : {}),
      source_messages: sourceWindow
        .filter((t) => t.role === "user")
        .map((t) => t.content),
      extracted_at: new Date().toISOString(),
    };
    const memConfidence = Math.min(1, trust / 100);

    if (existingMem) {
      const prevPayload =
        existingMem.clinical_payload &&
        typeof existingMem.clinical_payload === "object" &&
        !Array.isArray(existingMem.clinical_payload)
          ? (existingMem.clinical_payload as Record<string, unknown>)
          : {};
      const prevTrust = numTrust(prevPayload.trust_score as number | null);
      const correctedMem =
        norm(prevPayload.dosage) !== norm(effDosage) ||
        norm(prevPayload.frequency) !== norm(effFrequency);
      const statusChanged =
        norm(prevPayload.status as string | undefined) !== norm(m.status);

      if (
        trust > prevTrust ||
        (correctedMem && trust >= prevTrust - CORRECTION_TRUST_TOLERANCE) ||
        statusChanged ||
        existingMem.fact_summary.trim().toLowerCase() !==
          memSummary.trim().toLowerCase()
      ) {
        const { error } = await db
          .from("health_memories")
          .update({
            fact_summary: memSummary,
            clinical_payload: memPayload,
            confidence_score: memConfidence,
          })
          .eq("id", existingMem.id);
        if (error) {
          console.error("[Meds] medication memory update failed:", error);
        } else {
          console.info('[Meds] memory UPDATED for "%s"', trimmedName);
        }
      }
    } else {
      const { error } = await db.from("health_memories").insert({
        patient_id: patientId,
        contributor_role: "ai_extractor" as const,
        fact_category: "medication" as const,
        fact_summary: memSummary,
        clinical_payload: memPayload,
        confidence_score: memConfidence,
        is_verified: false,
      });
      if (error) {
        console.error("[Meds] medication memory insert failed:", error);
      } else {
        console.info(
          '[Meds] memory INSERTED "%s" (confidence %.2f)',
          memSummary,
          memConfidence,
        );
      }
    }
  }
}
