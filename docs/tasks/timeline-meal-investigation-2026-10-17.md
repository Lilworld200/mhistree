# Timeline meal investigation — 2026-10-17

Owner reported an unmoving timeline and explicitly approved sending “I ate a lot of food last night and my belly is swollen up this morning.” to configured Google Gemini with a synthetic patient and isolated database. No real patient source was sent by these tests. Earlier voice/journal/debugger changes were retained.

Read packet: AGENTS, WORKFLOW, clinical-records/identity-access contracts, feature maps/READMEs, UI reference, playbook T11/T12/T14/T15/T16 and Appendices A–D. No schema migration, hosted mutation, model change, deployment or historical backfill.

## Findings and fixes

Read-only recent hosted job metadata showed both saved contributions and failed/partial jobs. No original message bodies were queried. Generic historical failures do not establish quota exhaustion.

TimelineView fetched only on mounting/filter changes. It now refetches on focus, visible-tab return, processing completion and every15 seconds while visible, plus a manual Refresh timeline control. All reads use existing authenticated, no-store, bounded APIs, with no extra model calls. Older-page browsing retains its snapshot and receives a refresh offer when its first page changes; explicit refresh replaces records/cursor together. Revisions discard stale pagination responses. Failed reads clear displayed records and nested evidence. Listeners/timers clean up and pending requests cannot update an obsolete view. Coalescing retains notifications received during an in-flight check.

`record-updates.ts` carries a payload-free local event from chat extraction and manual processing. Other tabs are covered by focus/visible polling; no clinical browser messaging/storage is added.

`last night`/`this morning` previously resolved to unknown, placing these records after dated history. They now retain approximate calendar envelopes anchored to capture timezone and original wording. Morning uses its local day; night spans previous/current local days because night can cross midnight. Broad bounds deliberately avoid invented clock hours. Unsupported phrases/unknown zones stay unknown. Existing sources are not rewritten.

Extraction instructions explicitly request a context link from a subsequent symptom to the described activity using the exact activity quote, retaining separate facts without causation. This remains validated model output; unrelated stories are not linked merely for sharing a message.

## Evidence

Baseline real Gemini test saved two records, but dates were unknown and their context link absent. Four deterministic reproduction checks failed for focus, completion event, visible polling and date precision. Existing timeline/journal baseline passed seven tests.

After fixes, `node --env-file=.env --env-file=.env.local --import tsx scripts/verify-timeline-meal.mts` passed. The script overrides DATABASE_URL to a fresh native PostgreSQL cluster and starts a production Next server on127.0.0.1:3103. Synthetic sessions only; finally cleanup stops both processes. All HTTP stages200: empty records, conversation create, send, extraction/status, timeline read, reply generation and history. Invalid session401.

Configured Gemini `gemini-3.1-flash-lite` returned HTTP200/STOP for extraction (~2.2s) and reply (~1.25s). Two patient-reported items were accepted with no issues: “ate a large amount of food” (last night), “experienced abdominal swelling” (this morning), both approximate, symptom linked to activity. Reply retrieval included both reports. Ignored synthetic artifacts: `.local/meal-pipeline-result.json` and `.local/meal-terminal.log`. Correlated terminal stages show validation/time precision/commit/retrieval and provider token usage without clinical text, credentials or private reasoning.

Embeddings are not wired into this workflow; logs truthfully show `embeddingUsed:false`, `reason:sql-ranking`. No embedding call was claimed/added. The successful requests establish available quota for this test, not remaining daily quota or earlier failure causes.

Deterministic tests exercise actual TimelineView in jsdom and real NextRequest/native PostgreSQL routes with a model double, separately from live provider evidence. Focused seven-file suite31 passed/one unrelated opt-in live case skipped. Lint and production build/TypeScript passed. Final snapshot comparison follow-up checks are recorded in WORKFLOW. No browser visual verification; retained layout has one refresh control. Historical failed/unknown records were not administratively replayed or rewritten; originals remain for authenticated processing retry.

Owners/files: health-records timeline-view/record-updates, ai-chat chat-view and extraction status-view/server/time, timeline-refresh/extraction-relative-time/integration extraction-http tests, opt-in script above. Existing authorization and source/version/idempotency contracts remain unchanged.
