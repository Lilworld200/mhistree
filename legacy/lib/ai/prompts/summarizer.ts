/**
 * Summarization Prompt Builders (`lib/ai/prompts/summarizer.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Two-tier rolling summaries (see lib/server/summarization.ts):
 *
 *   • SESSION  — episodic recap of one chat session. Rolled incrementally:
 *                prev summary + messages after the cursor → new summary.
 *   • USER     — longitudinal "current health state" digest. Rolled by
 *                merging the previous digest + recent session recaps + new
 *                atomic health_memories.
 *
 * Conflict rules baked into both: newer information supersedes older;
 * clinician-verified facts outrank patient-reported ones.
 */

export interface SummaryTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface SessionSummaryInput {
  patientName: string;
  prevSummary: string | null;
  newTurns: SummaryTurn[];
}

export function buildSessionSummaryPrompt(
  input: SessionSummaryInput,
): string {
  const transcript = input.newTurns
    .map(
      (t) =>
        `${t.role === "user" ? "PATIENT" : t.role.toUpperCase()}: ${t.content}`,
    )
    .join("\n");

  return `You are the session summarizer for Mhistree, a personal health-record system. Compress the NEW conversation turns below into a rolling clinical recap for ${input.patientName}.
${
  input.prevSummary
    ? `
PREVIOUS SUMMARY OF THIS SESSION (already covers earlier turns):
${input.prevSummary}
`
    : "\nThis is the first roll for this session — there is no previous summary.\n"
}
OUTPUT — a factual prose recap (max 180 words) covering ONLY what is present in the previous summary plus the NEW turns:
- Health topics discussed and their outcome/resolution
- Medication changes: names, strengths, frequencies added/corrected/stopped
- Diagnoses or symptom reports and who established them (doctor/lab vs self-reported)
- Vitals mentioned with values
- Open follow-ups the companion still needs to chase (list at most 3)

RULES:
- Merge, never duplicate: if a detail appears in the previous summary AND the new turns unchanged, state it once.
- CONFLICTS: newer information wins; clinician-verified beats self-reported.
- No greetings, small talk, or AI pleasantries. Clinical signal only.
- Plain prose, no markdown headers. Return ONLY the summary text.

NEW TURNS:
${transcript}`;
}

export interface UserSummaryInput {
  patientName: string;
  prevUserSummary: string | null;
  sessionRecaps: { title: string; when: string; summary: string }[];
  newMemories: { category: string; summary: string; verified: boolean }[];
}

export function buildUserSummaryPrompt(input: UserSummaryInput): string {
  const recaps = input.sessionRecaps.length
    ? input.sessionRecaps
        .map((r) => `- (${r.when}) ${r.title}: ${r.summary}`)
        .join("\n")
    : "- None.";
  const memories = input.newMemories.length
    ? input.newMemories
        .map(
          (m) =>
            `- [${m.category}${m.verified ? ", clinician-verified" : ""}] ${m.summary}`,
        )
        .join("\n")
    : "- None.";

  return `You are the longitudinal summarizer for Mhistree. Maintain ${input.patientName}'s CURRENT HEALTH STATE digest — what an AI companion should know instantly to be aware of who this patient is.
${
  input.prevUserSummary
    ? `
PREVIOUS DIGEST (rolling — merge it with the new evidence below):
${input.prevUserSummary}
`
    : "\nFirst digest — no previous version exists.\n"
}
RECENT SESSION RECAPS (episodic evidence):
${recaps}

NEW ATOMIC HEALTH FACTS (highest fidelity evidence):
${memories}

OUTPUT — a dense prose digest (max 250 words) organized as flowing short paragraphs in this order:
1. Standing conditions: active diagnoses with status (confirmed vs suspected), including chronic conditions.
2. Current treatment picture: medication regimen names with doses/frequencies.
3. Allergies and contraindications.
4. Recent developments & trends from the session recaps (dated loosely, e.g. "late August").
5. Watch-list: what the companion should keep probing or monitoring next.

RULES:
- SUPERSEDE: when new evidence contradicts the previous digest, drop the outdated claim and reflect the newest state.
- Weight clinician-verified facts above patient-reported ones; label unconfirmed items as "suspected".
- Never invent conditions, medications, or dates not present in the inputs.
- Plain prose, no markdown headers. Return ONLY the digest text.`;
}
