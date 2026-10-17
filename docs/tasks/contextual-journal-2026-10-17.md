# Contextual timeline journal — 2026-10-17

Status: implemented and verified in the local source with synthetic native PostgreSQL, deterministic UI checks and real configured Gemini extraction. No hosted patient records, hosted schema changes, history backfill or deployment.

## Goal and governing packet

Owner requested concise journal statements instead of keyword labels; patient/care-team perspective from one stored subject; time-and-context matching of follow-ups; no repeated jogging entry for one run; compact contextual AI evidence. Governing reads: AGENTS/WORKFLOW, playbook T11/T12/T14/T15/T16 and Appendices A-D, clinical-records and identity/access contracts, AI-chat/health-records/practitioner READMEs, feature map and existing UI guide/catalog/snapshot71121bd. Original PDF remains the rendering authority; this slice required no new visual measurements or ambiguous table interpretation.

Root: `C:/Users/maseglo.com/Documents/FS-projects/Mhistree/mhistree`. Previous uncommitted chat-voice changes were retained. Git requires the command-local safe.directory override in this execution environment; no global Git configuration changed.

## Implementation and consumers

- `features/ai-chat/extraction/server.ts`: new journal prompt/validation, optional structured relation, model-wrapper normalization, lease/current-access recheck, source/event composition, per-item savepoints and retained partial work. Self-report predicates are capped at600 characters. Known incompatible dates/body sites do not merge; unclear links are held/partial. A reference to a previous run may inherit its date interval, but a distinct symptom cannot borrow the activity's exact timestamp.
- `features/ai-chat/extraction/context.ts`: up to8 earlier patient messages and12 prior reports from the same author/person/conversation; a16,000-character projected context budget. Assistant output/private notes/other people/later messages are excluded. Earlier report versions are reconstructed before the target message so the job's own writes do not change retry context. No model call holds a SQL lock.
- Acceptance compares the earlier-context fingerprint under a conversation advisory lock. A competing earlier write causes partial status and fresh extraction on retry before new items are written. If a prior partial attempt already accepted items, changed context is held for review rather than silently regenerated. Version races still use the existing kernel's expectedVersion conflict check. Successful source/event/state/audit/outbox changes retain atomic behavior.
- `features/health-records/{schema,narrative}.ts`: additive optional `body.reportStyle="reported-predicate"`; patient identity remains the subject, `body.text` is the concise predicate. One formatter renders “You reported that you…” or “The patient reported that they…”. No embedded name substitution. Legacy short labels use their source spans where available; no invented expansion. Arbitrary patient corrections keep their own attributed text.
- `features/health-records/{timeline,timeline-view}.ts/tsx`: patient cards and version history use the appropriate source status/body/spans. Existing event-time precision, original-source and correction controls remain. Version-history projection adds source_spans.
- `features/practitioner/workspace-view.tsx`: direct and organizational records share care-team wording and now explicitly show event time separately from the record timestamp.
- `features/ai-chat/retrieval.ts`: complete report sentences rather than bare predicates; original time/links retained; up to5 authorized earlier source/version references for enriched logical reports. Evidence is capped at40 candidates/24,000 serialized characters; excerpt/history/count/size limits set bounded indicators. These character budgets are implementation bounds, not tokenizer measurements. Sources remain recoverable through authorized history even when omitted from context.

No new table, migration, consent category, privilege, endpoint or clinical confirmation is introduced. Source IDs, authors, times and immutable version lineage stay with the owning record kernel. Same fact/occurrence uses a retained revision; a distinct new fact in that incident remains a linked report. Similar words or dates alone do not establish a shared occurrence. No reconstruction of unsupported historical detail or retroactive auto-merging of existing records was attempted.

## Verification

Baseline `pnpm exec vitest run tests/integration/timeline.test.ts tests/integration/corrections.test.ts tests/integration/chat.test.ts`: actual matched files were timeline/chat (the correction filename was stale),5 passed/1 opt-in live skipped. The correct `patient-corrections.test.ts` is included in all later broader checks.

| Check | Observed result |
| --- | --- |
| Nine affected files: journal-presentation, journal-extraction, timeline, patient-corrections, access-records, extraction, documents, chat, chat-send-flow |40 passed/3 explicit live cases skipped in final broader run |
| Final journal-presentation + journal-extraction after additional exact-time test and care-team time display |11 passed/1 live case skipped |
| Real-model original extraction case |Passed with patient-only activity/pain capture, reported predicates, original capture-time preservation and replay |
| Real-model three-message journal case (final) |Passed: one jogging logical report, linked ankle symptom, jogging version2 adds40 minutes and retains stressful-run detail; no duplicate activity |
| `pnpm lint` |Final full lint passed |
| `pnpm typecheck` / `pnpm build` / `pnpm check:client` |Typecheck and final production build (including TypeScript) passed; client-secret scan passed |
| `git diff --check` |Final check passed; Git emitted normal LF-to-CRLF checkout notices, no whitespace errors |

Integration assertions cover patient/care-team wording, same-report retained revisions, source-history references, next-day separation, conflicting-date savepoint rollback, unsupported reference/label holds, cross-patient non-enumerating denial before model access, no question/third-party facts, concurrent context changes, retry without duplicate activity, and preserving unknown precision for a symptom related to an exactly timed run. jsdom checks render actual RecordCard and shared direct/organization WorkspaceView; no browser screenshots or new visual-fidelity claims.

Two real-model failures found implementation gaps: `on that same run` was initially held as unsupported time; the next run exposed an echoed “The patient reported that they…” wrapper, also safely held. Explicit incident-time references and normalization of only known structural wrappers fixed these; the complete final live scenario passed. This is a real-provider check, not a model fixture. Latest raw synthetic outputs are ignored in `.local/journal-live-review.json`; no patient messages were read or sent to the model.

Live extraction now follows the existing `MHISTREE_LIVE_AI_TEST=1` + `.env` convention rather than requiring obsolete `.local/ai-config.json`. `tests/integration/extraction.test.ts` keeps deterministic validation/time cases always on and live calls explicitly opt-in. Deterministic model adapters in journal-extraction test validate persistence/fault/concurrency behavior, not provider intelligence.

SQL guidance: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and installed Supabase/Postgres skill short-transaction/keyset guidance. The changelog Markdown endpoint could not be read by the web tool (unsupported content type); no Supabase API/package/schema behavior changed in this slice. Existing current-authority/RLS rules remain in force; native synthetic queries establish local behavior rather than a new hosted deployment certification.

## Limits and next action

Semantic matching and prose are model outputs and can still need clarification. Only bounded same-conversation patient evidence is supplied for automatic follow-up reconciliation; records outside that window are not silently collapsed. A job paused by concurrent context change visibly needs retry; changed context after partial acceptance is held for review. Existing sources/versions are preserved, not rewritten as a richer guessed history. Context bounds disclose omissions and do not claim lifetime-complete retrieval. Clinical review/provider availability/production gates retain their existing status; this task does not start T32-T36 or repair unrelated saved audit findings.

Next: owner can exercise ordinary chat and inspect patient/care-team history. Read this record, the updated clinical-records contract and the extraction/narrative owner files before modifying matching rules. Broader episode search beyond the bounded window would need explicit confidence/ambiguity/source rules and new acceptance cases, not a keyword deduplication shortcut.
