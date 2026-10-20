# Mandatory timeline search — 2026-10-20

Owner requested reusable functions so chat always consults the timeline across days/conversations, matches stomach/belly wording and considers jogging before new leg pain without declaring sameness, unrelated episodes or causation.

Read packet: AGENTS/WORKFLOW, feature map, AI-chat/health-records READMEs, clinical-records/identity-access contracts, playbook T11/T12/T14/T15/T16 and Appendices A–D. Applied Supabase/Postgres guidance and checked current official [RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security) and [changelog](https://supabase.com/changelog). Markdown changelog endpoint was unsupported; HTML worked. No provider API/policy/schema changes.

## Findings and implementation

`generateReply` already called retrieval before generation and before publication. Its query used only eight long words/literal description substrings and ranked persistent states above matches; enough persistent/newer records could displace relevant history. Extraction was limited to the current conversation.

New server-only `features/ai-chat/timeline-search.ts` owns `searchTimeline(pool,session,context,patientPersonId,question)` and transaction helper `searchTimelineInAccess`. Caller establishes session/context under withAccess. No model-selected SQL/authority or new public transport. Current RLS/finalized current heads filter before ranking. Parameterized English full-text stems/prefixes use up to32 non-filler words, plus explicit everyday aliases. Body text, body site and source spans are searched. Belly/stomach/abdominal are search alternatives, not diagnostic equivalents.

Three lanes reserve16 relevant,8 persistent and8 recent candidates, deduplicated. Topic matches precede loose associations. Exercise/leg associations require event dates within14 days before search/target-message time: a retrieval heuristic, not a clinical rule/status expiry. Old direct topic matches remain searchable. Recent submissions retain actual occurrence dates/uncertainty. This is lexical/vocabulary search plus recent fallback, not unrestricted semantic/vector search. SQL ranks authorized rows inside the database; application/model return sizes are bounded. No lifetime-scale performance guarantee or new search index is claimed.

Shared retrieval preserves source/spans, event/capture times, current status, versions/prior sources, gaps and asOf; adds relevance hints, and remains capped at24,000 serialized characters. Existing pre-generation retrieval/publication recheck remain mandatory. Assessment/practitioner consumers share this owner under distinct existing contexts.

Extraction now searches pre-message sources across conversations, supplying up to8 read-only `possibleTimelineContext` candidates inside16,000 characters. They are not eligible same-report/same-incident mutation targets; validation rejects speculative merges. Existing prior-evidence/time/version rules remain. Clear current observations survive while linkage needs clarification; improvement does not resolve an older episode. Automatic cross-conversation reconciliation after confirmation is not introduced; retained relation rules remain conservative.

Patient prompt requires considering search every turn, mentioning relevant history only, checking plausible links naturally with actual dates/source IDs, respecting denied connections and avoiding assumed persistence/recovery/causation. Search does not mutate records. Safe terminal event `timeline.search.complete` shows counts/method with no clinical text or extra model calls. Embeddings remain unused.

## Verification

Synthetic native PostgreSQL only; no hosted reads/writes, real patient data, migration, configuration changes, backfill or deployment. No UI/layout changes/browser checks. Clusters cleaned up by tests.

- Initial existing-flow suite16 passed/two live cases skipped.
- Final new search suite7 passed/one opt-in live skipped. Covers aliases beyond first-eight filler words and41 newer persistent states; related activity without a write; another-patient denial; actual reply owner receiving history; wider extraction context rejecting speculative merges; clear improvement saved with unknown status/no confirmed episode link; old activity not promoted as recent association; latest correction/prior lineage.
- Eight-file existing regression37 passed/two opt-in live skipped: chat, extraction HTTP, journal extraction, send flow, debugger, timeline, presentation and corrections.
- Search plus access-records follow-up17 passed/one live skipped, including11 existing RLS/transaction tests for private/draft exclusion, revocation, source reads, corrections and rollback. Final old-activity test was added afterward and passed in the seven-test search run.
- `MHISTREE_LIVE_AI_TEST=1 pnpm exec vitest run tests/integration/timeline-search.test.ts`: six tests passed at that checkpoint, including real Gemini generation through durable chat for both belly-improvement and jogging/leg-pain scenarios in new conversations. Earlier records/41 persistent noise records were seeded. Initial live run correctly recalled Monday stomach pain but omitted the source ID; citation instructions tightened and repeat passed both examples. Later deterministic recency refinement does not change those scenario dates/prompt. This is smoke evidence, not clinical certification or guaranteed model behavior.
- Full lint/TypeScript/build/client scan results recorded in WORKFLOW. Retrieval/logging add no model calls; explicit live generation used normal Gemini tokens.

Files: new timeline-search.ts; retrieval.ts; extraction/context.ts/server.ts; patient-prompt.ts; new integration/timeline-search.test.ts. AGENTS7.2, feature map, README, contract and WORKFLOW retain the decision/map/evidence. Existing T32–T36 and clinical release reviews remain separate. Bounded heuristic retrieval does not prove every relevant lifetime entry matches/fits.
