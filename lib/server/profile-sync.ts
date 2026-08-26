/**
 * Derived Health Profile Sync (`lib/server/profile-sync.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Maintains the two-tier AI-derived view of the patient's standing conditions,
 * stored in `health_profiles.derived_health` JSONB so every new chat session
 * starts with instant awareness of who the patient is:
 *
 *   CONFIRMED   ← memory verified by a clinician (is_verified) or contributed
 *                 directly by one. Also union-merged into the manual
 *                 `chronic_conditions` / `allergies` TEXT columns (never
 *                 clobbering user-entered content) so dashboards show it.
 *   DETERMINED  ← unverified, but established by a credible source
 *                 (source_credibility ∈ {clinician, test_result}) AND
 *                 extraction clarity ≥ 0.7. JSONB-only: the AI uses it to
 *                 know what to watch for; users see it as unconfirmed.
 *
 * Anything weaker stays exclusively in health_memories (visible on /timeline).
 * The sync recomputes idempotently from ALL qualifying memories — bounded and
 * safe to re-run after every extraction that produced qualifying rows.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DBHealthMemory } from "@/lib/supabase/types";

/** Minimum extraction clarity for an UNVERIFIED fact to reach DETERMINED. */
const DETERMINED_CLARITY_THRESHOLD = 0.7;

const CREDIBLE_SOURCES = new Set(["clinician", "test_result"]);

export interface DerivedCondition {
  name: string;
  level: "confirmed" | "determined";
  confidence: number;
  credibility: string;
  icd10_code: string | null;
  snomed_code: string | null;
  first_detected_at: string;
  updated_at: string;
}

export interface DerivedHealth {
  conditions: DerivedCondition[];
  allergies: DerivedCondition[];
  last_synced_at: string;
}

type QualifyingCategory = "diagnosis" | "chronic_condition" | "allergy";

const QUALIFYING_CATEGORIES: QualifyingCategory[] = [
  "diagnosis",
  "chronic_condition",
  "allergy",
];

/** Strip conversational boilerplate down to a short condition label. */
function deriveConditionName(mem: DBHealthMemory): string {
  const payload =
    mem.clinical_payload && typeof mem.clinical_payload === "object"
      ? (mem.clinical_payload as Record<string, unknown>)
      : {};
  const preferred =
    typeof payload.condition_name === "string" && payload.condition_name.trim()
      ? payload.condition_name
      : mem.fact_summary;

  let name = preferred.trim();
  name = name.replace(
    /^(the\s+)?(patient|he|she|i)\s+(has|had|have|is|was|were|experiences?|experienced|suffers?( from)?:?|complains? of|reports?|mentioned|confirmed|noted)\s+/i,
    "",
  );
  name = name.replace(/^(been\s+)?(diagnosed|treated|tested)\s+(with|for|positive)?\s*/i, "");
  name = name.split(/[,.—;:(]/)[0];
  name = name.replace(/\s+/g, " ").trim();
  if (name.length > 60) name = `${name.slice(0, 57).trimEnd()}…`;
  return name || preferred.slice(0, 60);
}

function numClarity(payload: Record<string, unknown>): number {
  const v = payload.clarity_score;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function credibilityOf(mem: DBHealthMemory): string {
  const payload =
    mem.clinical_payload && typeof mem.clinical_payload === "object"
      ? (mem.clinical_payload as Record<string, unknown>)
      : {};
  const v = payload.source_credibility;
  return typeof v === "string" ? v : "unknown";
}

/** Split a manual text field into clean entries. */
function splitManualList(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Recompute derived_health from all diagnosis/chronic_condition/allergy
 * memories and (when changed) persist it + union-merge CONFIRMED entries into
 * the manual text columns. Non-fatal: logs and returns on failure.
 */
export async function syncDerivedHealth(
  db: SupabaseClient,
  patientId: string,
): Promise<void> {
  try {
    const { data: rows, error } = await db
      .from("health_memories")
      .select("*")
      .eq("patient_id", patientId)
      .in("fact_category", QUALIFYING_CATEGORIES);

    if (error) {
      console.error("[ProfileSync] memory fetch failed:", error);
      return;
    }
    const memories = (rows ?? []) as DBHealthMemory[];

    // ── Group by normalized condition name across both categories ──
    interface Group {
      name: string;
      category: QualifyingCategory;
      members: DBHealthMemory[];
    }
    const groups = new Map<string, Group>();

    for (const mem of memories) {
      const name = deriveConditionName(mem);
      if (!name) continue;
      const key = `${mem.fact_category}:${name.toLowerCase()}`;
      const group = groups.get(key);
      if (group) {
        group.members.push(mem);
      } else {
        groups.set(key, {
          name,
          category: mem.fact_category as QualifyingCategory,
          members: [mem],
        });
      }
    }

    const conditions: DerivedCondition[] = [];
    const allergies: DerivedCondition[] = [];

    for (const group of groups.values()) {
      let level: DerivedCondition["level"] | null = null;

      const confirmed = group.members.some(
        (m) => m.is_verified || m.contributor_role === "clinician",
      );
      if (confirmed) {
        level = "confirmed";
      } else {
        const credible = group.members.some(
          (m) =>
            CREDIBLE_SOURCES.has(credibilityOf(m)) &&
            numClarity(
              (m.clinical_payload ?? {}) as Record<string, unknown>,
            ) >= DETERMINED_CLARITY_THRESHOLD,
        );
        if (credible) level = "determined";
      }
      if (!level) continue; // stays in health_memories only

      const best = [...group.members].sort((a, b) => {
        const rank = (m: DBHealthMemory) =>
          m.is_verified || m.contributor_role === "clinician" ? 2 : 1;
        return (
          rank(b) - rank(a) ||
          Number(b.confidence_score) - Number(a.confidence_score)
        );
      })[0];

      const entry: DerivedCondition = {
        name: group.name,
        level,
        confidence: Math.min(1, Number(best.confidence_score) || 0),
        credibility: credibilityOf(best),
        icd10_code:
          group.members.find((m) => m.icd10_code)?.icd10_code ?? null,
        snomed_code:
          group.members.find((m) => m.snomed_code)?.snomed_code ?? null,
        first_detected_at: group.members
          .map((m) => m.created_at)
          .sort()[0],
        updated_at: group.members
          .map((m) => m.created_at)
          .sort()
          .slice(-1)[0],
      };

      if (group.category === "allergy") allergies.push(entry);
      else conditions.push(entry);
    }

    const rankOrder = (e: DerivedCondition) =>
      (e.level === "confirmed" ? 0 : 1) * 1000 +
      (Date.now() - new Date(e.updated_at).getTime()) / 1e10;
    conditions.sort((a, b) => rankOrder(a) - rankOrder(b));
    allergies.sort((a, b) => rankOrder(a) - rankOrder(b));

    const derived: DerivedHealth = {
      conditions,
      allergies,
      last_synced_at: new Date().toISOString(),
    };

    // ── Fetch current profile row ──
    const { data: profile } = await db
      .from("health_profiles")
      .select("id, chronic_conditions, allergies, derived_health")
      .eq("user_id", patientId)
      .maybeSingle();

    const prevDerived = (profile?.derived_health ?? null) as DerivedHealth | null;
    const unchanged =
      prevDerived !== null &&
      JSON.stringify({
        conditions: prevDerived.conditions ?? [],
        allergies: prevDerived.allergies ?? [],
      }) ===
        JSON.stringify({
          conditions: derived.conditions,
          allergies: derived.allergies,
        });

    if (profile && unchanged) {
      console.info("[ProfileSync] no changes — skipping writes");
      return;
    }

    // Union-merge CONFIRMED entries into the manual text columns.
    const mergeList = (
      existing: string | null | undefined,
      confirmedNames: string[],
    ): string | null => {
      const manual = splitManualList(existing);
      const seen = new Set(manual.map((s) => s.toLowerCase()));
      const additions = confirmedNames.filter(
        (n) => !seen.has(n.toLowerCase()),
      );
      if (additions.length === 0) return existing ?? null;
      return [...manual, ...additions].join(", ");
    };

    const confirmedConditionNames = conditions
      .filter((c) => c.level === "confirmed")
      .map((c) => c.name);
    const confirmedAllergyNames = allergies
      .filter((a) => a.level === "confirmed")
      .map((a) => a.name);

    const nextChronic = mergeList(
      profile?.chronic_conditions,
      confirmedConditionNames,
    );
    const nextAllergies = mergeList(profile?.allergies, confirmedAllergyNames);

    if (profile) {
      const { error: updateErr } = await db
        .from("health_profiles")
        .update({
          derived_health: derived,
          ...(nextChronic !== (profile.chronic_conditions ?? null)
            ? { chronic_conditions: nextChronic }
            : {}),
          ...(nextAllergies !== (profile.allergies ?? null)
            ? { allergies: nextAllergies }
            : {}),
        })
        .eq("id", profile.id);
      if (updateErr) {
        console.error("[ProfileSync] profile update failed:", updateErr);
        return;
      }
    } else {
      const { error: insertErr } = await db.from("health_profiles").insert({
        user_id: patientId,
        derived_health: derived,
        ...(nextChronic ? { chronic_conditions: nextChronic } : {}),
        ...(nextAllergies ? { allergies: nextAllergies } : {}),
      });
      if (insertErr) {
        console.error("[ProfileSync] profile insert failed:", insertErr);
        return;
      }
    }

    console.info(
      "[ProfileSync] synced — %d confirmed/determined condition(s), %d allergen(s)",
      conditions.length,
      allergies.length,
    );
  } catch (err) {
    console.error("[ProfileSync] pipeline failed:", err);
  }
}
