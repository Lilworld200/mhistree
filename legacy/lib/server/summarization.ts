/**
 * Two-Tier Rolling Summarization (`lib/server/summarization.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Keeps the AI's long-term context cheap and complete without re-reading raw
 * transcripts or dumping hundreds of atomic memories into every prompt.
 *
 *   Tier 1 — SESSION recap (scope 'chat_session'):
 *     Threshold-based incremental roll. Tracks a cursor
 *     (summarized_through_message_id) so each pass reads ONLY the turns added
 *     since the previous roll; new_summary = LLM(prev_summary, new_turns).
 *     Fires once a session accumulates ≥ SESSION_SUMMARY_MIN_MESSAGES new
 *     turns past the cursor.
 *
 *   Tier 2 — USER digest (scope 'user'):
 *     Rolling merge of the previous digest + recent session recaps + atomic
 *     health_memories created since the last roll. Fires after every K new
 *     session recaps, or earlier if the digest is stale (> MAX_AGE_DAYS).
 *
 * Storage is APPEND-ONLY on user_summaries (migration 006): every roll inserts
 * a new versioned row; readers always take the latest per (scope, session).
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ai } from "@/lib/ai/gateway";
import {
  buildSessionSummaryPrompt,
  buildUserSummaryPrompt,
  type SummaryTurn,
} from "@/lib/ai/prompts/summarizer";

/** New turns required (past the cursor) before a session roll fires. */
const SESSION_SUMMARY_MIN_MESSAGES = 12;
/** New session recaps required before the user-level digest rolls. */
const USER_SUMMARY_EVERY_K_SESSIONS = 5;
/** Roll anyway when any recap exists but the digest is older than this. */
const USER_SUMMARY_MAX_AGE_DAYS = 7;
/** How many recent session recaps feed the user-level roll. */
const RECAPS_PER_ROLL = 10;

const SummaryTextSchema = z.object({
  summary: z.string().min(1).max(4000),
});

interface SummaryRow {
  id: string;
  user_id: string;
  scope: string;
  session_id: string | null;
  summary: string;
  key_metadata: Record<string, unknown> | null;
  version: string;
  summarized_through_message_id: string | null;
  source_cursor: Record<string, unknown>;
  created_at: string;
}

async function runSummarizer(prompt: string): Promise<string> {
  const result = await ai.structured("summarization", {
    prompt,
    schema: SummaryTextSchema,
    validate: (data: unknown) => SummaryTextSchema.parse(data),
  });
  return result.summary.trim();
}

function nextVersion(prev: SummaryRow | null): string {
  const n = Number.parseInt(prev?.version ?? "0", 10);
  return String(Number.isFinite(n) ? n + 1 : 1);
}

// ── Tier 1: rolling session recap ────────────────────────────────────────────

export async function maybeSummarizeSession(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<void> {
  try {
    // Latest existing recap for this session = rolling base + cursor.
    const { data: prevRows, error: prevErr } = await db
      .from("user_summaries")
      .select("*")
      .eq("user_id", userId)
      .eq("scope", "chat_session")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (prevErr) throw prevErr;
    const prev = ((prevRows ?? []) as SummaryRow[])[0] ?? null;

    // Turns after the cursor (id-based slicing is timestamp-safe).
    const { data: msgRows, error: msgErr } = await db
      .from("chat_messages")
      .select("id, role, content, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    if (msgErr) throw msgErr;
    const allMsgs = (msgRows ?? []) as {
      id: string;
      role: string;
      content: string;
      created_at: string;
    }[];

    let startIdx = 0;
    if (prev?.summarized_through_message_id) {
      const cursorIdx = allMsgs.findIndex(
        (m) => m.id === prev.summarized_through_message_id,
      );
      if (cursorIdx >= 0) startIdx = cursorIdx + 1;
    }
    const newMsgs = allMsgs.slice(startIdx);

    if (
      newMsgs.length < SESSION_SUMMARY_MIN_MESSAGES ||
      !newMsgs.some((m) => m.role === "user")
    ) {
      return;
    }

    const patientName = await resolvePatientName(db, userId);
    const prompt = buildSessionSummaryPrompt({
      patientName,
      prevSummary: prev?.summary ?? null,
      newTurns: newMsgs.map(
        (m) =>
          ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content,
          }) satisfies SummaryTurn,
      ),
    });

    console.info(
      "[Summarization] session roll — session=%s newTurns=%d prev=%s",
      sessionId,
      newMsgs.length,
      prev ? `v${prev.version}` : "none",
    );
    const summary = await runSummarizer(prompt);

    const { error: insertErr } = await db.from("user_summaries").insert({
      user_id: userId,
      scope: "chat_session",
      session_id: sessionId,
      summary,
      key_metadata: { turn_count: allMsgs.length },
      version: nextVersion(prev),
      summarized_through_message_id: newMsgs[newMsgs.length - 1].id,
      source_cursor: {},
    });
    if (insertErr) throw insertErr;
    console.info("[Summarization] session recap INSERTED (session=%s)", sessionId);
  } catch (err) {
    console.error("[Summarization] session roll failed:", err);
  }
}

// ── Tier 2: rolling user digest ─────────────────────────────────────────────

export async function maybeRollUserSummary(
  db: SupabaseClient,
  userId: string,
): Promise<void> {
  try {
    const { data: prevRows, error: prevErr } = await db
      .from("user_summaries")
      .select("*")
      .eq("user_id", userId)
      .eq("scope", "user")
      .order("created_at", { ascending: false })
      .limit(1);
    if (prevErr) throw prevErr;
    const prev = ((prevRows ?? []) as SummaryRow[])[0] ?? null;

    const sinceIso = prev?.created_at ?? "1970-01-01T00:00:00Z";

    const { count: newRecapCount, error: cntErr } = await db
      .from("user_summaries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("scope", "chat_session")
      .gt("created_at", sinceIso);
    if (cntErr) throw cntErr;

    const stale =
      prev !== null &&
      Date.now() - new Date(prev.created_at).getTime() >
        USER_SUMMARY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

    if (!newRecapCount || (newRecapCount < USER_SUMMARY_EVERY_K_SESSIONS && !stale)) {
      return;
    }

    // Recent recaps (newest first) + their session titles.
    const { data: recapRows, error: recapErr } = await db
      .from("user_summaries")
      .select("summary, session_id, created_at")
      .eq("user_id", userId)
      .eq("scope", "chat_session")
      .order("created_at", { ascending: false })
      .limit(RECAPS_PER_ROLL);
    if (recapErr) throw recapErr;
    const recaps = (recapRows ?? []) as {
      summary: string;
      session_id: string | null;
      created_at: string;
    }[];

    let titles = new Map<string, string>();
    const sessionIds = recaps
      .map((r) => r.session_id)
      .filter((id): id is string => Boolean(id));
    if (sessionIds.length > 0) {
      const { data: sessRows } = await db
        .from("chat_sessions")
        .select("id, title")
        .in("id", sessionIds);
      titles = new Map(
        ((sessRows ?? []) as { id: string; title: string }[]).map((s) => [
          s.id,
          s.title,
        ]),
      );
    }

    // Atomic memories created since the last roll (bounded window).
    const { data: memRows, error: memErr } = await db
      .from("health_memories")
      .select("fact_category, fact_summary, is_verified, created_at")
      .eq("patient_id", userId)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(50);
    if (memErr) throw memErr;
    const mems = (memRows ?? []) as {
      fact_category: string;
      fact_summary: string;
      is_verified: boolean;
    }[];

    if (recaps.length === 0 && mems.length === 0) return;

    const patientName = await resolvePatientName(db, userId);
    const prompt = buildUserSummaryPrompt({
      patientName,
      prevUserSummary: prev?.summary ?? null,
      sessionRecaps: recaps.map((r) => ({
        title: titles.get(r.session_id ?? "") ?? "Session",
        when: new Date(r.created_at).toLocaleDateString(),
        summary: r.summary,
      })),
      newMemories: mems.map((m) => ({
        category: m.fact_category,
        summary: m.fact_summary,
        verified: m.is_verified,
      })),
    });

    console.info(
      "[Summarization] user roll — recaps=%d newMemories=%d prev=%s",
      recaps.length,
      mems.length,
      prev ? `v${prev.version}` : "none",
    );
    const summary = await runSummarizer(prompt);

    const { error: insertErr } = await db.from("user_summaries").insert({
      user_id: userId,
      scope: "user",
      session_id: null,
      summary,
      key_metadata: {
        recaps_merged: recaps.length,
        memories_merged: mems.length,
      },
      version: nextVersion(prev),
      summarized_through_message_id: null,
      source_cursor: { rolled_after_recaps: newRecapCount },
    });
    if (insertErr) throw insertErr;
    console.info("[Summarization] user digest INSERTED");
  } catch (err) {
    console.error("[Summarization] user roll failed:", err);
  }
}

async function resolvePatientName(
  db: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data } = await db
    .from("users")
    .select("first_name")
    .eq("id", userId)
    .maybeSingle();
  return (data as { first_name: string } | null)?.first_name || "the patient";
}
