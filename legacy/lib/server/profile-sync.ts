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
 * CONDITION LIFE-CYCLE (newest evidence wins):
 *   The newest qualifying memory for a condition decides its state. A
 *   resolution statement ("my doctor just confirmed my malaria is gone")
 *   moves the group into `derived_health.resolved` WITH THE DATE of the
 *   resolving memory — soft removal: it leaves the active tiers and the
 *   dashboard text fields but the AI still knows the history. A later
 *   re-diagnosis memory becomes newest again and flips the group back to
 *   active automatically.
 *
 * Text-column parity: `synced_text_entries` records which names WE added to
 * the manual text columns, enabling true REMOVAL on resolution while user-
 * entered content always survives untouched.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DBHealthMemory } from "@/lib/supabase/types";

/** Minimum extraction clarity for an UNVERIFIED fact to reach DETERMINED. */
const DETERMINED_CLARITY_THRESHOLD = 0.7;

const CREDIBLE_SOURCES = new Set(["clinician", "test_result"]);

/** Legacy-row fallback when clinical_payload.condition_status is absent. */
const RESOLVED_KEYWORDS = [
  "has resolved",
  "is resolved",
  "is gone",
  "cleared",
  "cured",
  "recovered from",
  "no longer has",
];

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

export interface ResolvedCondition {
  name: string;
  level: "confirmed" | "determined";
  /** created_at of the memory that reported the resolution — crucial date. */
  resolved_at: string;
  resolution_summary: string;
  icd10_code: string | null;
  snomed_code: string | null;
}

export interface DerivedHealth {
  conditions: DerivedCondition[];
  allergies: DerivedCondition[];
  resolved: ResolvedCondition[];
  synced_text_entries: { chronic: string[]; allergies: string[] };
  last_synced_at: string;
}

type QualifyingCategory = "diagnosis" | "chronic_condition" | "allergy";

const QUALIFYING_CATEGORIES: QualifyingCategory[] = [
  "diagnosis",
  "chronic_condition",
  "allergy",
];

function payloadOf(mem: DBHealthMemory): Record<string, unknown> {
  return mem.clinical_payload &&
    typeof mem.clinical_payload === "object" &&
    !Array.isArray(mem.clinical_payload)
    ? (mem.clinical_payload as Record<string, unknown>)
    : {};
}

/** Strip conversational boilerplate down to a short condition label. */
function deriveConditionName(mem: DBHealthMemory): string {
  const preferred =
    typeof payloadOf(mem).condition_name === "string" &&
    (payloadOf(mem).condition_name as string).trim()
      ? (payloadOf(mem).condition_name as string)
      : mem.fact_summary;

  let name = preferred.trim();
  name = name.replace(
    /^(the\s+)?(patient|he|she|i)\s+(has|had|have|is|was|were|experiences?|experienced|suffers?( from)?:?|complains? of|reports?|mentioned|confirmed|noted)\s+/i,
    "",
  );
  name = name.replace(
    /^(been\s+)?(diagnosed|treated|tested)\s+(with|for|positive)?\s*/i,
    "",
  );
  name = name.split(/[,.—;:(]/)[0];
  name = name.replace(/\s+/g, " ").trim();
  if (name.length > 60) name = `${name.slice(0, 57).trimEnd()}…`;
  return name || preferred.slice(0, 60);
}

function numClarity(mem: DBHealthMemory): number {
  const v = payloadOf(mem).clarity_score;
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function credibilityOf(mem: DBHealthMemory): string {
  const v = payloadOf(mem).source_credibility;
  return typeof v === "string" ? v : "unknown";
}

function isResolvedMemory(mem: DBHealthMemory): boolean {
  if (payloadOf(mem).condition_status === "resolved") return true;
  const s = mem.fact_summary.toLowerCase();
  return RESOLVED_KEYWORDS.some((k) => s.includes(k));
}

/** Split a manual text field into clean entries. */
function splitManualList(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupeUnion(a: string[], b: string[]): string[] {
  const seen = new Set(a.map((s) => s.toLowerCase()));
  return [...a, ...b.filter((s) => !seen.has(s.toLowerCase()))];
}

/**
 * Recompute derived_health from all diagnosis/chronic_condition/allergy
 * memories; persist tiers, resolution history, and (with add/remove parity)
 * CONFIRMED-active names in the manual text columns. Non-fatal.
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

    // ── Group by normalized name per category ──
    interface Group {
      name: string;
      category: QualifyingCategory;
      members: DBHealthMemory[]; // oldest → newest by created_at
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
    for (const g of groups.values()) {
      g.members.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }

    const rankMember = (m: DBHealthMemory) =>
      m.is_verified || m.contributor_role === "clinician" ? 2 : 1;

    const conditions: DerivedCondition[] = [];
    const allergies: DerivedCondition[] = [];
    const resolved: ResolvedCondition[] = [];

    for (const group of groups.values()) {
      const best = [...group.members].sort(
        (a, b) =>
          rankMember(b) - rankMember(a) ||
          Number(b.confidence_score) - Number(a.confidence_score),
      )[0];
      const level: DerivedCondition["level"] =
        group.members.some(
          (m) => m.is_verified || m.contributor_role === "clinician",
        )
          ? "confirmed"
          : group.members.some(
                (m) =>
                  CREDIBLE_SOURCES.has(credibilityOf(m)) &&
                  numClarity(m) >= DETERMINED_CLARITY_THRESHOLD,
              )
            ? "determined"
            : "confirmed"; // resolved history keeps its best-known level

      // NEWEST EVIDENCE WINS — the latest memory decides active vs resolved.
      const newest = group.members[group.members.length - 1];
      if (isResolvedMemory(newest)) {
        resolved.push({
          name: group.name,
          level,
          resolved_at: newest.created_at,
          resolution_summary: `${newest.fact_summary}${
            credibilityOf(newest) === "clinician" ? " (doctor-confirmed)" : ""
          }`,
          icd10_code:
            group.members.find((m) => m.icd10_code)?.icd10_code ?? null,
          snomed_code:
            group.members.find((m) => m.snomed_code)?.snomed_code ?? null,
        });
        continue; // soft-removed from active tiers
      }

      const entry: DerivedCondition = {
        name: group.name,
        level,
        confidence: Math.min(1, Number(best.confidence_score) || 0),
        credibility: credibilityOf(best),
        icd10_code: group.members.find((m) => m.icd10_code)?.icd10_code ?? null,
        snomed_code:
          group.members.find((m) => m.snomed_code)?.snomed_code ?? null,
        first_detected_at: group.members[0].created_at,
        updated_at: newest.created_at,
      };
      if (group.category === "allergy") allergies.push(entry);
      else conditions.push(entry);
    }

    const recency = (d: string) => Date.now() - new Date(d).getTime();
    const tierOrder = (e: DerivedCondition) =>
      (e.level === "confirmed" ? 0 : 1) * 10000 + recency(e.updated_at) / 1e10;
    conditions.sort((a, b) => tierOrder(a) - tierOrder(b));
    allergies.sort((a, b) => tierOrder(a) - tierOrder(b));
    resolved.sort((a, b) => recency(b.resolved_at) - recency(a.resolved_at));

    // ── Fetch current profile row ──
    const { data: profile } = await db
      .from("health_profiles")
      .select("id, chronic_conditions, allergies, derived_health")
      .eq("user_id", patientId)
      .maybeSingle();

    const prev = (profile?.derived_health ?? null) as Partial<DerivedHealth> | null;

    // Add/REMOVE parity: anything WE previously added may be removed on
    // resolution; anything the USER typed manually always survives.
    const manualOnly = (
      current: string | null | undefined,
      prevAuto: string[],
    ): string[] =>
      splitManualList(current).filter(
        (n) => !prevAuto.some((a) => a.toLowerCase() === n.toLowerCase()),
      );

    const manualChronic = manualOnly(
      profile?.chronic_conditions,
      prev?.synced_text_entries?.chronic ?? [],
    );
    const manualAllergies = manualOnly(
      profile?.allergies,
      prev?.synced_text_entries?.allergies ?? [],
    );

    const activeConfirmedConditions = conditions
      .filter((c) => c.level === "confirmed")
      .map((c) => c.name);
    const activeConfirmedAllergies = allergies
      .filter((a) => a.level === "confirmed")
      .map((a) => a.name);

    const nextChronicArr = dedupeUnion(
      manualChronic,
      activeConfirmedConditions,
    );
    const nextAllergiesArr = dedupeUnion(
      manualAllergies,
      activeConfirmedAllergies,
    );

    const derived: DerivedHealth = {
      conditions,
      allergies,
      resolved,
      synced_text_entries: {
        chronic: activeConfirmedConditions,
        allergies: activeConfirmedAllergies,
      },
      last_synced_at: new Date().toISOString(),
    };

    // Change detection across every persisted dimension.
    const unchanged =
      prev != null &&
      JSON.stringify(prev.conditions ?? []) === JSON.stringify(conditions) &&
      JSON.stringify(prev.allergies ?? []) === JSON.stringify(allergies) &&
      JSON.stringify(prev.resolved ?? []) === JSON.stringify(resolved) &&
      (profile?.chronic_conditions ?? null) ===
        (nextChronicArr.length ? nextChronicArr.join(", ") : null) &&
      (profile?.allergies ?? null) ===
        (nextAllergiesArr.length ? nextAllergiesArr.join(", ") : null);

    if (profile && unchanged) {
      console.info("[ProfileSync] no changes — skipping writes");
      return;
    }

    if (profile) {
      const { error: updateErr } = await db
        .from("health_profiles")
        .update({
          derived_health: derived,
          chronic_conditions: nextChronicArr.length
            ? nextChronicArr.join(", ")
            : null,
          allergies: nextAllergiesArr.length ? nextAllergiesArr.join(", ") : null,
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
        ...(nextChronicArr.length
          ? { chronic_conditions: nextChronicArr.join(", ") }
          : {}),
        ...(nextAllergiesArr.length
          ? { allergies: nextAllergiesArr.join(", ") }
          : {}),
      });
      if (insertErr) {
        console.error("[ProfileSync] profile insert failed:", insertErr);
        return;
      }
    }

    console.info(
      "[ProfileSync] synced — %d active condition(s), %d allergen(s), %d resolved",
      conditions.length,
      allergies.length,
      resolved.length,
    );
  } catch (err) {
    console.error("[ProfileSync] pipeline failed:", err);
  }
}
