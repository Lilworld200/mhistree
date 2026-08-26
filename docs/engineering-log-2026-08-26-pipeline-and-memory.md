# Engineering Log — Medication Pipeline Fixes & Memory Architecture
**Date:** 2026-08-26 · **Scope:** Bug fixes (medication persistence, timeline pollution) + Feature build (two-tier rolling summarization, derived health-profile intelligence) + Life-cycle intelligence (medication stop/finish, condition resolution) · **Verification status:** `tsc --noEmit` 0 errors · ESLint clean on all changed files · `pnpm build` passes

---

## Table of Contents
1. [Session Overview](#1-session-overview)
2. [Phase 0 — Codebase Exploration](#2-phase-0--codebase-exploration)
3. [Phase 1 — Bug Fix: Medications Not Persisting](#3-phase-1--bug-fix-medications-not-persisting)
4. [Phase 2 — Bug Fix: Summary/Recap Rows Polluting the Timeline](#4-phase-2--bug-fix-summaryrecap-rows-polluting-the-timeline)
5. [Phase 3 — Research: `medical_document_chunks` (RAG)](#5-phase-3--research-medical_document_chunks-rag)
6. [Phase 4 — Research & Design: Two-Tier Rolling Summaries](#6-phase-4--research--design-two-tier-rolling-summaries)
7. [Phase 5 — Implementation: Health Profile Intelligence + Summarization](#7-phase-5--implementation-health-profile-intelligence--summarization)
8. [Phase 6 — Life-Cycle Intelligence: Stop/Finish Meds & Resolved Conditions](#8-phase-6--life-cycle-intelligence-stopfinish-meds--resolved-conditions)
9. [Decision Ledger — Every User Prompt That Shaped the Build](#9-decision-ledger--every-user-prompt-that-shaped-the-build)
10. [File Inventory](#10-file-inventory)
11. [Audits & Verification Gates](#11-audits--verification-gates)
12. [Deployment Checklist](#12-deployment-checklist)
13. [Known Limitations & Future Work](#13-known-limitations--future-work)

---

## 1. Session Overview

| Phase | Type | Outcome |
|---|---|---|
| 0 | Exploration | Full project understanding from 10 `.md` docs; baseline audits |
| 1 | Bug fix | Named medications now persist reliably; decision-trace logging added |
| 2 | Bug fix | Recap/summary rows banned from `memories[]`; atomic-fact rule added |
| 3 | Research | RAG store explained (no code changes) |
| 4 | Research | mem0 article digested; rolling-summary architecture designed |
| 5 | Feature | Two-tier derived health profile + cursor-based rolling summaries shipped |
| 6 | Feature | Medication stop/finish transitions + resolved-condition soft removal with dates |

---

## 2. Phase 0 — Codebase Exploration

**User prompt:** *"explore the code base understand what the code is about by reading all the md files… lets begin building and fixing bugs."*

An explore agent read all 10 markdown files (`README`, `AGENTS`, `TODO`, `WORKING_WORKFLOW`, `SKILL`, `idea_todo`, `docs/build_scaffold/idea_scaffold`, three design-principle docs). Findings:

- **Product:** Mhistree — healthcare AI companion. Patient side builds a longitudinal health record from chat; clinician side verifies it.
- **Stack:** Next.js 16.3.1 (App Router, Turbopack), React 19, TypeScript 5, Tailwind v4, Zustand, Supabase (Postgres + pgvector + pg_trgm), Vercel AI SDK v7 through a gateway abstraction (`lib/ai/gateway.ts`) currently serving Gemini models via env config.
- **Protected workflow:** `WORKING_WORKFLOW.md` forbids regressing the patient AI persona (warm doctor-friend tone, probing strategy, 🧠 Memory noted chip).

**Baseline audits run:**
| Gate | Result |
|---|---|
| `npx tsc --noEmit` | ✅ 0 errors |
| `pnpm lint` | ❌ 13 errors / 7 warnings — concentrated in legacy prototype pages `app/qwentwo|qwenthree|qwenfour` (+ one in `features/clinician/components/patients-view.tsx`) |

**User decision:** legacy pages are left **as-is** (excluded from remediation scope).

---

## 3. Phase 1 — Bug Fix: Medications Not Persisting

### Reported symptom
First medication (Artemether-lumefantrine) saved correctly. Follow-up message naming two more meds ("am also suppose to take amoxicillin and white color vitamin c") produced AI replies claiming they were saved ("🧠 Memory noted: Adding Amoxicillin and Vitamin C") but Supabase logs showed **only SELECT queries — zero INSERTs into `medications`**, plus one *wrong* timeline event appearing instead.

### Root-cause trace (read-only investigation)
Full data-flow traced: client `POST /api/ai/chat` → context SELECTs → SSE stream → background extraction over last-6-turns window → zod-validated structured call → clarity gates → writes. Four breaks identified:

1. **Clarity gate asymmetry (primary).** `app/api/ai/chat/route.ts` filtered meds with `clarity_score < 0.5` *before* persistence. The extraction prompt (`lib/ai/prompts/extraction.ts`) simultaneously instructed the model to report vague meds "with their true **low** clarity_score". Name-but-no-dosage mentions (amoxicillin, vitamin C) scored ~0.3–0.45 → silently dropped.
2. **Timeline mislabeling.** `app/api/timeline/route.ts:77` mapped every `health_memories` row except allergies to `clinical_note`, which the UI renders as a **"Condition"** event (`features/timeline/store.ts:167`). Medication facts that *did* land as memories showed up as bogus Condition events.
3. **Fragile fire-and-forget.** Extraction ran inside an unawaited `Promise.allSettled` after the SSE response returned — freezable mid-flight on serverless; matches the logs showing zero writes.
4. **Chip/persistence decoupling.** The 🧠 chip is generated purely by system-prompt instruction (`lib/ai/prompts/patient.ts`) — no coupling to actual DB writes.

Dedup logic in `lib/server/medication-persistence.ts` was **exonerated** (exact-lowercase-name matching cannot false-positive new drugs).

### User decisions (verbatim intent)
- Save model: *"meds below 0.5 clarity is saved in timeline but not in medication, and medication with 0.5 is saved in medication also, and Extraction prompt updated so name-present meds always clear 0.5."* → hybrid gate retained, prompt recalibrated.
- Timeline: fix the mapping so medication memories render as Medication events.
- Reliability/logging: *"if its possible to log ai thinking data… but only if it wont burn token"* → implemented as **decision-trace logging** emitted from the same LLM call (zero extra tokens): provider/model/window at start, full extractor output with scores, every gate decision, every DB write outcome.
- Memory chip: **leave as-is** (protected persona).
- Legacy pages: untouched.

### Changes made
| File | Change |
|---|---|
| `lib/ai/prompts/extraction.ts` | Identifiable drug name alone ⇒ clarity ≥ 0.6 (missing dosage/frequency go to `missing_details`, not the score); HARD RULE: one item **per drug** when several named; new anchor example mirroring the exact failing utterance |
| `lib/ai/schemas/extraction.ts` | `clarity_score` description aligned with the ≥0.6 floor |
| `app/api/timeline/route.ts` | `fact_category === "medication"` → category `"medication"` (renders as Medication event) |
| `app/api/ai/chat/route.ts` | Extraction wrapped in `after()` from `next/server` (survives response close); `[Extraction] start / extractor output / holding … / complete` logging |
| `lib/server/medication-persistence.ts` | Per-action logs: `INSERTED` / `UPDATED` / `SKIPPED update (reason)` / `skipped unidentified`, plus success logs for the dual-write memory |

**Result:** user re-tested — *"perfect it worked perfectly."*

---

## 4. Phase 2 — Bug Fix: Summary/Recap Rows Polluting the Timeline

### Reported symptom
After the fix, an extra entry resembling a **conversation summary** appeared on the timeline.

### Diagnosis
Timeline titles for memory-derived events ARE the literal `fact_summary` text (`timeline/route.ts`). Only free-form writer is the extractor's `memories[]` array. Causes:

1. Every turn re-extracts the last 6 turns (including assistant turns) — invites recap generation.
2. Dedup is **exact lowercase string equality** vs the last 200 summaries — any paraphrase passes.
3. Nothing instructed the model to exclude assistant text or avoid bundling multiple facts.
4. `user_summaries` table ruled out — nothing wrote to it (at the time).

### User decisions
- **Prompt-only fix** (no fuzzy server-side dedup yet).
- **Leave existing rows** in the database.
- Critical clarification preserved in wording: *"that doesnt mean two or more timelines cant be added simultaneously… if the user mentions two medications these are two events… two life events or conditions… calls for two events."* → ATOMICITY ≠ fewer entries; it means one fact per item, many items allowed.

### Changes made
| File | Change |
|---|---|
| `lib/ai/prompts/extraction.ts` | OUTPUT_CONTRACT rewritten: ATOMICITY (one fact per item; several distinct facts ⇒ separate items — explicit blessing of multi-event output), NO RECAPS (bundling statements banned; meds live exclusively in `medications[]`), only newly-introduced patient info, assistant turns are context-only, med re-emission WITH clarified details still required so trust/correction merging keeps working |
| `lib/ai/schemas/extraction.ts` | `fact_summary` describe rewritten from "clinical summary statement" to atomic single-fact statement with good/bad examples |

---

## 5. Phase 3 — Research: `medical_document_chunks` (RAG)

Explanation delivered (no code changes): pgvector RAG store — `vector(768)` embedding per ~500-char chunk (50 overlap), HNSW cosine index, ingestion via parser → `chunkText()` → `ai.embed()` → insert; retrieval via `match_medical_chunks` RPC returning top-4 chunks injected as `RELEVANT MEDICAL DOCUMENTS` into the system prompt. Known gaps documented: pdf-parse/tesseract.js not installed, naive chunking, duplicate chunks on re-upload, no similarity floor.

---

## 6. Phase 4 — Research & Design: Two-Tier Rolling Summaries

**User prompt:** two conceptual tables — *chat summary* (per-session quick guide so the bot needn't re-read transcripts) and *user summary* (current-state digest) — both **rolling** ("summarize the old summary and then summarize the new one"), AI reads only the last 1–2. Resource provided: mem0.ai LLM chat-history summarization guide.

**Article synthesis:** summarization compresses (lossy); memory formation selects (lossless-ish) — Mhistree already has the formation layer (`health_memories`), so summaries must layer ON TOP, not replace it. Adopted patterns: contextual/threshold-based summarization, hierarchical memory tiers, conflict resolution, importance weighting.

**Key architectural addition beyond the user's sketch:** a **cursor** (`summarized_through_message_id`) so each roll reads only post-cursor turns — making rolls O(new messages), cheap, and idempotent.

**User decisions:**
| Question | Decision |
|---|---|
| Storage | Extend existing `user_summaries` (one table, scope column) |
| Versioning | Append-only (new row per roll; readers take latest) |
| Trigger | Threshold-based (background) |
| Prompt diet | Once a digest exists, it REPLACES the raw memory dump |

---

## 7. Phase 5 — Implementation: Health Profile Intelligence + Summarization

**User framing:** solve (1) *"AI has a general idea of what my user is"* — profile stores DETERMINED-not-guessed facts (high-confidence AI-detected AND confirmed knowledge), available instantly at chat start; lean on JSONB metadata. And (2) session memory without context loss/overload/token burn (Phase 4 design).

**Follow-up decisions:** exactly TWO confidence tiers; storage *"mixture of both but lead towards JSONB"* — CONFIRMED items surface on dashboards (union-merged into manual text columns, never clobbering user edits), trends remain on timeline, everything machine-readable lives in JSONB so the AI knows what to watch for during chats.

### What shipped

**Migration `supabase/migrations/006_summaries_and_derived_profile.sql`**
- `user_summaries` += `scope ('user'|'chat_session')`, `session_id FK`, `summarized_through_message_id FK`, `source_cursor JSONB`; reader index `(user_id, scope, session_id, created_at DESC)`
- `health_profiles` += `derived_health JSONB DEFAULT '{}'`

**Extraction upgrade**
- Memory items gain `source_credibility` enum (`clinician | test_result | self_reported | unknown`) + `SOURCE CREDIBILITY RULES` prompt block ("be accurate — never generous")
- Optional normalized `condition_name` for diagnosis/chronic/allergy items

**`lib/server/profile-sync.ts` — `syncDerivedHealth()`**
- Groups qualifying memories by normalized condition name
- **CONFIRMED** ← `is_verified` OR clinician-contributed ⇒ JSONB + union-merge into `chronic_conditions`/`allergies` text (split on `,;\n`, case-insensitive dedupe)
- **DETERMINED** ← unverified BUT credibility ∈ {clinician, test_result} AND payload `clarity_score ≥ 0.7` ⇒ JSONB only
- Idempotent: skips writes when tier arrays unchanged; safe re-run each qualifying extraction; non-fatal with full logging

**`lib/ai/prompts/summarizer.ts`**
- Session recap ≤180 words: topics/outcomes, med changes, diagnoses + who established them, vitals, ≤3 open follow-ups; conflicts: newer wins, verified beats self-reported
- User digest ≤250 words: standing conditions, treatment picture, allergies, recent developments, watch-list; SUPERSEDE semantics; unconfirmed labeled "suspected"

**`lib/server/summarization.ts`**
- Tier 1: rolls when ≥12 new turns past the cursor (id-index slicing, timestamp-safe); stores cursor on the inserted row
- Tier 2: rolls after ≥5 new session recaps, OR any recap + digest older than 7 days; merges latest ≤10 recaps + ≤50 new atomic memories
- Append-only inserts with incremented `version`; all failures logged non-fatally; runs on `summarization` purpose (env-tunable via `AI_SUMMARY_MODEL`)

**Prompt injection (`patient.ts` + chat route)**
- HEALTH PROFILE section gains `CONFIRMED CONDITIONS (clinician-established)` and `AI-DETERMINED, UNCONFIRMED (watch for these)` lines
- When a user digest exists: `LONGITUDINAL SUMMARY` + up to 5 other-session recaps REPLACE the raw VERIFIED/UNVERIFIED memory dump (current session excluded — its transcript is already present); graceful fallback to raw list until first roll
- Chat route fetches both summary types in the existing parallel context fetch (PostgREST embed `chat_sessions(title)`)

**Wiring (`chat/route.ts` `after()` block, post-extraction order):**
```
syncDerivedHealth() → maybeSummarizeSession(activeSessionId) → maybeRollUserSummary()
```
Ordering note: `after()` callbacks execute after stream completion, so the assistant reply is already persisted when the session roll reads messages.

---

## 8. Phase 6 — Life-Cycle Intelligence: Stop/Finish Meds & Resolved Conditions

### Reported symptom
User told the AI: *"my doctor just confirmed that my malaria is gone but i still have typhoid so am no longer taking the malaria medicine."* Profile and timeline updated, but the `medications` row stayed `active`. Runtime logs captured the smoking gun:

```
[Extraction] extractor output:
{ "name": "Unidentified antimalarial", "clarity": 0.3, ... }
[Extraction] holding 1 med(s) below 0.5 clarity …
```

### Root causes
1. **Extractor blindness (primary).** "The malaria medicine" couldn't be resolved inside the 6-turn window — the drug name lived only in the DB. Nothing fed existing meds to the extractor.
2. **No life-cycle contract.** No rule told the model that stop/finish statements must emit a medication item; the output contract only asked for "regimens mentioned."
3. **Latent persistence trap.** Had it been emitted, a sparse stop-statement (~trust 60) vs stored row (~90) would fail the ±10 correction-tolerance gate → silent skip; and raw `unknown` dosage/frequency would have clobbered good data on any passing update.

### User decisions
- Update, never delete: keep the row, flip status to not-taken, add **JSONB provenance** — why stopped, who declared it, confirmation percentage/strength — so the AI knows both eras of the drug.
- Extend the same philosophy to conditions: resolved conditions get **"slightly removed"** from health_profile (gone from active tiers/dashboard fields) while the AI retains knowledge **and the resolution date is preserved as crucial data**.
- Resolved conditions should ALSO render on the /health dashboard now.

### What shipped

**Migration `007_medication_lifecycle.sql`** — `medications.lifecycle_metadata JSONB`:
```json
{ "event": "discontinued", "reason": "Malaria infection has resolved",
  "confirmed_by": "doctor", "confirmation_strength": 0.9,
  "evidence_message": "<patient's words>", "recorded_at": "…" }
```

**Extractor gains memory of the chart** — `buildExtractionPrompt(turns, knownMedications)` now receives the active med list (`chat/route.ts`); prompt block resolves indirect references ("my malaria medicine", "the antibiotics") against KNOWN MEDICATIONS ON FILE first.

**New schema/prompt contracts**
- Medication items: `status_change_reason`, `status_change_by (doctor|patient|pharmacist|unknown)`
- Memory items: `condition_status (active|resolved)` for diagnosis/chronic items
- MEDICATION LIFE-CYCLE rules: stops/finishes/resumes MUST emit an item; exempt from no-re-emission atomicity; anchor example mirroring the exact reported utterance
- CONDITION STATUS rules: resolution statements are new information and must be extracted

**Persistence hardening (`lib/server/medication-persistence.ts`)**
- Life-cycle transitions override **unconditionally** (bypass trust-tolerance gates)
- **Sparse-safe merge**: incoming `unknown` dosage/frequency filled from the stored row BEFORE trust computation & writes — good data never clobbered, trust scored on merged regimen
- `ended_at` stamped on non-active transitions, cleared on resume; `lifecycle_metadata` written on transition
- Dual-write wording truthful: "Patient stopped taking X (reason)" / "completed X course"
- `[Meds] UPDATED … [lifecycle-transition]` log tag

**Condition resolution (`lib/server/profile-sync.ts` v2)**
- Newest-evidence-wins per condition group: newest qualifying memory decides active vs resolved
- Resolved groups → `derived_health.resolved[]` with `resolved_at` = created_at of the resolving memory (the crucial date), excluded from active tiers
- **Add/REMOVE parity for text columns**: new `synced_text_entries` tracks which names WE previously merged into `chronic_conditions`/`allergies`; every resync rebuilds `(current − AI-added) ∪ confirmed-active` so resolutions genuinely leave the dashboard fields while manual user entries always survive; re-diagnosis flips a group back to active automatically

**Surfaces**
- Prompt: new `RESOLVED CONDITIONS (medical history — no longer active): malaria — resolved Aug 25, 2026` line (bounded to 10)
- Dashboard: BaselineCard gains a "Resolved" fact row; HealthView fetches `/api/profile` and renders derived confirmed/determined/resolved labels

---

## 9. Decision Ledger — Every User Prompt That Shaped the Build

| # | User input (condensed) | Decision it produced |
|---|---|---|
| 1 | "Explore codebase via all md files… begin building and fixing bugs" | Explore agent; baseline audits; project map |
| 2 | Described medication bug w/ chat transcript + Supabase logs; "find out why… fix or refactor" | Deep pipeline trace; 4-break diagnosis |
| 3 | Hybrid save model (sub-0.5 → timeline only; ≥0.5 → meds table; prompt makes named drugs clear bar) | Clarity rubric rewrite + gate kept |
| 4 | Fix timeline mapping; log AI processing without burning tokens; leave chip; legacy pages as-is | Category fix; `after()` + decision-trace logs; persona frozen |
| 5 | "worked perfectly" + report of summary-looking timeline rows | Recap-pollution investigation |
| 6 | Prompt-only fix; keep existing data; **multi-fact ⇒ multi-entry must survive** | Atomicity rules worded to ban bundles, bless multiples |
| 7 | Explain `medical_document_chunks` | RAG explainer (research mode) |
| 8 | Two-table summary idea, rolling merges, read-last-1–2 + mem0 link | Hierarchical design + cursor mechanism |
| 9 | Extend user_summaries; append-only; thresholds; summaries replace raw dump | Storage/versioning/trigger/diet locked |
| 10 | Two top problems: general user awareness (determined vs guessed, JSONB) + session memory | Combined workstream plan |
| 11 | Exactly two tiers; mixture leaning JSONB; confirmed → dashboard, trends → timeline/AI watch-list | Promotion logic + union-merge behavior |
| 12 | Reported malaria-discontinuation failure + runtime log; update-don't-delete with JSONB provenance (why/who/percentage/severity) | Life-cycle transitions, `lifecycle_metadata`, known-meds injection |
| 13 | Same for profiles: resolved = "slightly removed" but AI still knows; **resolution date is crucial** | Resolved array w/ dates, newest-wins, text add/remove parity |
| 14 | "Add dashboard UI too" for resolved conditions; "update that md file" | BaselineCard resolved row + this document |

---

## 10. File Inventory

**Created**
- `supabase/migrations/006_summaries_and_derived_profile.sql`
- `supabase/migrations/007_medication_lifecycle.sql`
- `lib/server/profile-sync.ts`
- `lib/server/summarization.ts`
- `lib/ai/prompts/summarizer.ts`
- *(this document)*

**Modified**
- `app/api/ai/chat/route.ts` — imports, summary context fetches, `after()` hardening + logging, post-extraction sync/roll calls, known-meds injection into extractor
- `app/api/timeline/route.ts` — medication memory category mapping
- `lib/ai/prompts/extraction.ts` — clarity rubric, multi-drug + atomicity + credibility + life-cycle + condition-status blocks, KNOWN MEDICATIONS ON FILE section
- `lib/ai/prompts/patient.ts` — `SessionRecapContext`, derived-tier + RESOLVED CONDITIONS lines, summary-first diet
- `lib/ai/schemas/extraction.ts` — clarity/trust descriptions, `source_credibility`, `condition_name`, `condition_status`, `status_change_reason/by`, atomic `fact_summary`
- `lib/server/medication-persistence.ts` — decision logging, sparse-safe merge, unconditional life-cycle override, `ended_at`/`lifecycle_metadata` writes
- `lib/supabase/types.ts` — `DBHealthProfile.derived_health`, extended `DBUserSummary`
- `features/health/components/baseline-card.tsx` — `resolved` data row
- `features/health/components/health-view.tsx` — `/api/profile` fetch, derived labels

**Untouched by design**
- `app/qwentwo|qwenthree|qwenfour` (legacy prototypes), `WORKING_WORKFLOW.md` persona prompts, `user_summaries` pre-existing rows, all RAG/document code

---

## 11. Audits & Verification Gates

Every phase closed only after:

1. `npx tsc --noEmit` → **0 errors** (run after Phases 1, 2, 5, and 6)
2. `eslint` on every changed file → **clean** (legacy pages excluded per decision)
3. `pnpm build` → compiled + 24/24 pages generated (only pre-existing `pdf-parse`/`tesseract.js` optional-dependency warnings — documented in TODO.md, unrelated)
4. Runtime observability added so future regressions self-explain: `[Extraction]`, `[Meds]`, `[ProfileSync]`, `[Summarization]` prefixed logs cover start/model/output/gates/writes/completion — Phase 6's own diagnosis was made *from these logs* (proof the observability investment pays off)
5. Safety properties verified by construction: guest traffic never touches DB paths; all background work non-fatal; appends idempotent (cursor + change-detection); manual profile text edits never clobbered (union-merge + removal-parity); life-cycle data is update-only — nothing deleted

---

## 12. Deployment Checklist

- [ ] **Run `supabase/migrations/006_summaries_and_derived_profile.sql`** in Supabase Dashboard → SQL Editor (required before testing Phase 5 features)
- [ ] **Run `supabase/migrations/007_medication_lifecycle.sql`** in Supabase SQL Editor (required before testing Phase 6 features)
- [ ] Restart dev server
- [ ] Visual test — profile tiers: tell the AI "my doctor diagnosed me with high blood pressure" → expect `[ProfileSync] synced` log, CONFIRMED tier in prompt, dashboard field updated
- [ ] Visual test — promotion guard: vague self-suspected chatter stays out of both tiers
- [ ] Visual test — session roll: 12+ messages in one session → `[Summarization] session recap INSERTED` + new `user_summaries` row (scope `chat_session`)
- [ ] Visual test — cross-session memory: open a NEW session → AI already knows prior history; verify `LONGITUDINAL SUMMARY` replaced the raw dump (scope `user` row exists)
- [ ] Visual test — medication stop: say "my doctor confirmed my malaria is gone, am no longer taking the malaria medicine" → extractor output shows resolved generic name with `status=discontinued`; `[Meds] UPDATED … [lifecycle-transition]` log; row shows `status='discontinued'`, filled `ended_at`, populated `lifecycle_metadata`
- [ ] Visual test — condition resolution: same message → `[ProfileSync] synced … N resolved`; malaria leaves CONFIRMED line + dashboard Conditions field; appears under RESOLVED CONDITIONS prompt line and dashboard "Resolved" row **with date**
- [ ] Regression check — mention a brand-new medication → `[Meds] INSERTED` log, row in `medications`, Medication-type event on `/timeline`, no bundled recap row

---

## 13. Known Limitations & Future Work

1. **Fuzzy memory dedup deferred** — paraphrase protection relies on prompt discipline; token-overlap/pg_trgm similarity guard remains an option if recaps ever leak through.
2. **Legacy lint debt** — `app/qwentwo|qwenthree|qwenfour` + `patients-view.tsx` still fail lint (intentionally out of scope).
3. **RAG gaps unchanged** — PDF/image parsers uninstalled, naive chunking, duplicate ingestion, no similarity floor.
4. **AI-trends UI component** — user envisions a dedicated surface for what the trend engine picks up; backend already provides the data (`derived_health.determined` tier + timeline categories).
5. **Summary quality tuning** — word ceilings (180/250) and thresholds (12 turns / 5 recaps / 7 days) are constants at the top of `lib/server/summarization.ts`; tune after real-world usage.
6. **`extract-medical` route remains dead** (no frontend caller) and ungated vs the chat path's gating — candidate for consolidation onto shared modules.
7. **Known-meds injection lists ACTIVE meds only** — resuming a long-discontinued drug by indirect reference may still resolve as "Unidentified"; widen the list if this surfaces in practice.
8. **Resolution keyword fallback** for legacy memories is English-only and conservative; new extractions use the structured `condition_status` field instead.
