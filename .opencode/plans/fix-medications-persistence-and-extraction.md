# Fix Medication Persistence + Extraction Improvements

## Root Cause (why meds don't save to Supabase)

Two compounding failures:

1. **`/api/timeline` returns HTTP 400** — `app/api/timeline/route.ts:54,57` SELECTs and ORDER BYs `medications.created_at`, which does not exist in the DB (Postgres error `42703`, confirmed in Supabase logs). This kills the timeline feed used by `/timeline` and `/health`.
2. **Unnamed drugs silently dropped by design** — extraction HARD RULES force `clarity_score < 0.5` + `"Unidentified …"` naming when the patient never says the drug name, and `chat/route.ts:452` skips unidentified meds entirely.

## Approved Decisions

- Add `created_at` column via migration (not remove from code)
- All 4 extraction improvements: missing-field detection, update-on-correction (**±10 trust tolerance**), improved drug-name extraction, dynamic trust scoring
- User performs visual testing; I verify code correctness only

---

## Implementation Steps

### 1. NEW FILE `supabase/migrations/005_medication_timestamps.sql`

```sql
-- ===========================================================================
-- Mhistree Database Migration — 005_medication_timestamps.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds created_at / updated_at timestamps to the medications table.
--
-- Fixes Postgres error 42703 ("column medications.created_at does not exist")
-- raised by app/api/timeline/route.ts which selects and orders by created_at.
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
```

### 2. NEW FILE `lib/server/trust-score.ts`

Deterministic trust scoring — replaces raw LLM guess as the stored value.

```typescript
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

const isIdentifiedDrug = (name: string): boolean =>
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
```

### 3. NEW FILE `lib/server/medication-persistence.ts`

Shared upsert + dual-write logic, reused by both chat route and extract-medical route.

```typescript
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
 *            – a correction: any of dosage/frequency/status/drug_name changed
 *              while trust is within ±10 of the stored value (user revising
 *              details keeps roughly the same evidence level)
 *   3. Dual-write into `health_memories` (fact_category = "medication") so
 *      /timeline surfaces it alongside other health facts — updated under the
 *      same override rules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MedicalExtraction } from "@/lib/ai/schemas/extraction";
import { computeTrustScore } from "@/lib/server/trust-score";

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
}

const UNIDENTIFIED_RE = /^unidentified\b/i;
const isUnidentified = (name: string) => UNIDENTIFIED_RE.test(name.trim());
const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function numTrust(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? (n as number) : 0;
}

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
    .select("id, drug_name, dosage, frequency, status, trust_score, inferred_by")
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

    const genericName =
      m.clinical_payload &&
      typeof m.clinical_payload.generic_name === "string"
        ? m.clinical_payload.generic_name
        : trimmedName;
    const brandName =
      m.clinical_payload && typeof m.clinical_payload.brand_name === "string"
        ? m.clinical_payload.brand_name
        : null;

    const trust = computeTrustScore({
      drug_name: genericName,
      dosage: m.dosage,
      frequency: m.frequency,
      duration: m.duration,
      inferred_by: m.inferred_by,
    });

    const existing = existingByName.get(trimmedName.toLowerCase());
    const unidentifiedNow = isUnidentified(trimmedName);

    if (existing) {
      const existingTrust = numTrust(existing.trust_score);
      const wasUnidentified = isUnidentified(existing.drug_name);
      const corrected =
        norm(existing.dosage) !== norm(m.dosage) ||
        norm(existing.frequency) !== norm(m.frequency) ||
        norm(existing.status) !== norm(m.status);
      const withinTolerance =
        trust >= existingTrust - CORRECTION_TRUST_TOLERANCE;

      const shouldOverride =
        trust > existingTrust || (wasUnidentified && !unidentifiedNow);

      if (!shouldOverride && corrected && withinTolerance && !wasUnidentified) {
        // Pure correction (same evidence level, revised details)
      }

      if (
        shouldOverride ||
        (corrected && withinTolerance && !wasUnidentified)
      ) {
        const { error } = await db
          .from("medications")
          .update({
            drug_name: trimmedName,
            dosage: m.dosage,
            frequency: m.frequency,
            rxnorm_code: m.rxnorm_code || null,
            status: m.status,
            trust_score: trust,
            inferred_by: m.inferred_by ?? null,
          })
          .eq("id", existing.id);
        if (error) {
          console.error("[Meds] medication update failed:", error);
        }
      }
    } else if (!unidentifiedNow) {
      const { error } = await db.from("medications").insert({
        patient_id: patientId,
        drug_name: trimmedName,
        dosage: m.dosage,
        frequency: m.frequency,
        rxnorm_code: m.rxnorm_code || null,
        status: m.status,
        trust_score: trust,
        inferred_by: m.inferred_by ?? null,
      });
      if (error) {
        console.error("[Meds] medication insert failed:", error);
      }
    }

    // ── Dual-write into health_memories (category "medication") ──
    if (unidentifiedNow) continue;

    const dosagePart =
      m.dosage && m.dosage.toLowerCase() !== "unknown" ? ` ${m.dosage}` : "";
    const freqPart =
      m.frequency && m.frequency.toLowerCase() !== "unknown"
        ? `, ${m.frequency}`
        : "";
    const memSummary = `Patient is taking ${trimmedName}${dosagePart}${freqPart}`;

    const { data: existingMemRows } = await db
      .from("health_memories")
      .select("id, clinical_payload")
      .eq("patient_id", patientId)
      .eq("fact_category", "medication")
      .ilike("fact_summary", `%${trimmedName}%`)
      .limit(1);

    const existingMem = existingMemRows?.[0] ?? null;
    const memPayload = {
      drug_name: trimmedName,
      ...(brandName ? { brand_name: brandName } : {}),
      dosage: m.dosage,
      frequency: m.frequency,
      ...(m.duration ? { duration: m.duration } : {}),
      trust_score: trust,
      llm_trust_score: m.trust_score ?? null,
      inferred_by: m.inferred_by ?? null,
      rxnorm_code: m.rxnorm_code || null,
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
      const prevSummary = String(
        prevPayload.__summary ?? "",
      );
      const summaryChanged = false; // summaries compared below via payload diff

      void summaryChanged;
      void prevSummary;

      const correctedMem =
        norm(prevPayload.dosage as string | undefined) !== norm(m.dosage) ||
        norm(prevPayload.frequency as string | undefined) !== norm(m.frequency);

      if (
        trust > prevTrust ||
        (correctedMem && trust >= prevTrust - CORRECTION_TRUST_TOLERANCE)
      ) {
        await db
          .from("health_memories")
          .update({
            fact_summary: memSummary,
            clinical_payload: memPayload,
            confidence_score: memConfidence,
          })
          .eq("id", existingMem.id);
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
      }
    }
  }
}
```

**NOTE during implementation:** clean up the dead `prevSummary`/`summaryChanged` lines before finishing — compare against the CURRENT row's `fact_summary` fetched in the select instead.

### 4. EDIT `lib/ai/schemas/extraction.ts`

In the `medications` array item object, after `frequency`:

```typescript
duration: z
  .string()
  .default("unknown")
  .describe(
    "Total course length or quantity if stated, e.g. 'for 5 days', '10 tablets'. Use 'unknown' when not mentioned.",
  ),
```

Update `drug_name` describe:

```typescript
drug_name: z
  .string()
  .describe(
    "Generic (INN) name resolved from brand names or misspellings, e.g. 'Coartem' → 'artemether-lumefantrine', 'panadol' → 'paracetamol'. Only use 'Unidentified …' when NO drug can be resolved.",
  ),
```

### 5. EDIT `lib/ai/prompts/extraction.ts`

Add after CLARITY_RUBRIC anchor examples:

```typescript
const DRUG_NAME_RESOLUTION = `DRUG NAME RESOLUTION (applies to every medication):
- Resolve brand names and common misspellings to the GENERIC (INN) drug name and keep the original brand wording in clinical_payload.brand_name:
  Coartem → artemether-lumefantrine · Panadol/Tylenol → paracetamol · Advil/Nurofen/Brufen → ibuprofen · Voltaren → diclofenac · Naprosyn → naproxen · Amoxil → amoxicillin · Flagyl → metronidazole · Zinnat → cefuroxime · Augmentin → amoxicillin-clavulanate · Aspirin stays aspirin.
- Tolerate spelling errors ("panadole", "ibuprofin") and resolve them.
- If the patient describes a class only ("an NSAID", "antimalarial tablets"), do NOT invent a specific drug: use "Unidentified <class>" and clarity < 0.5.
- When a doctor prescribed it but no name surfaced yet, still report inferred_by "doctor" — trust scoring handles the rest.`;
```

Include `${DRUG_NAME_RESOLUTION}` in `buildExtractionPrompt` between CLARITY_RUBRIC and SEVERITY_RUBRIC.

### 6. EDIT `lib/ai/prompts/patient.ts`

Replace the numbered list under ACTIVE CLARIFICATION PROBING step 2 bullet with explicit chase-the-missing-details instruction:

```typescript
// In the ACTIVE CLARIFICATION PROBING section, strengthen with:
// - Track what is STILL missing per topic (drug name → strength/dosage → frequency → duration) and ask exactly ONE focused question per turn targeting the most important missing field.
// - Never re-ask answered details; move down the checklist until nothing critical is missing.
// - When complete, confirm the full regimen back in one short sentence.
```

(Concretely: extend the existing bullet list — add a sub-bullet "Work through missing fields in order: name → strength per dose → frequency → duration; one question per message.")

### 7. EDIT `app/api/ai/chat/route.ts`

Replace the whole `// ── Medications ...` block (lines ~397–549) with:

```typescript
// ── Medications (clarity-gated shared persistence: upsert + dual write) ──
const storableMeds = extraction.medications.filter((m) =>
  isStorable(m.clarity_score),
);
await persistExtractedMedications(db, pId, storableMeds, recentWindow);
```

Add import: `import { persistExtractedMedications } from "@/lib/server/medication-persistence";`

### 8. EDIT `app/api/ai/extract-medical/route.ts`

Replace the simple medications insert block (lines 117–129) with the same call:

```typescript
if (extraction.medications.length > 0) {
  await persistExtractedMedications(
    supabase,
    patientId,
    extraction.medications.filter(
      (m) => !/^unidentified\b/i.test(m.drug_name),
    ),
    [{ role: "user", content: cleanText }],
  );
}
```

### 9. EDIT `features/health/components/baseline-card.tsx`

Accept derived props and render live values with fallbacks:

```typescript
export interface BaselineData {
  allergies?: string | null;
  conditions?: string | null;
  medications?: string | null;
  bloodGroup?: string | null;
}

export function BaselineCard({ data, onViewAll }: { data: BaselineData; onViewAll: () => void }) {
  // FactRows fall back to "None recorded"/"Not specified"
}
```

In `features/health/components/health-view.tsx`, derive from timeline store events:

```typescript
const medEvents = events.filter((e) => e.category === "medication");
const medLabel =
  medEvents.length > 0
    ? `${medEvents.length} active (${medEvents.slice(0, 2).map((e) => e.title.replace(/^Medication: /, "").replace(/\s*\(.*\)$/, "")).join(", ")})`
    : "None recorded";
```

Pass `{ data: { medications: medLabel }, onViewAll }`. (Allergies/conditions/blood group remain placeholder until profile data is wired — out of scope.)

### 10. Verify

- `npx tsc --noEmit`
- `npm run lint`
- ⚠️ REMIND USER: run `005_medication_timestamps.sql` in Supabase SQL Editor
- User does visual test: chat the sample NSAID conversation → check `medications` + `health_memories` rows → reload `/health`, `/timeline`, `/profile`
