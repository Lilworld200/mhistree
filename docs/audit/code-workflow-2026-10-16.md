# Code and workflow audit — 2026-10-16

Scope: static inspection of active application routes, identity/access boundaries, current SQL migrations, chat, extraction, documents, health state, care and daily-work paths. Read AGENTS, WORKFLOW, the retained playbook appendices and authentication README. No application fixes, deployment, hosted queries, provider calls or patient-data access. This is a findings inventory, not a guarantee that every defect has been discovered. Preserved `legacy/` code is outside the active runtime and is not counted as a new defect.

## Findings

1. **High — authentication throttles are global.** `lib/http.ts:55-56` returns the same `first-party-entry` key for everyone. `features/auth/email.ts:54,286,390` therefore permits only ten signups/hour, fifteen login attempts/minute and ten reset requests/hour across the entire application. One client can exhaust those budgets for all patients. Establish a validated deployment request identity and retain separate account/address limits.

2. **High — retrieval can exclude the evidence being requested.** `features/ai-chat/retrieval.ts:37-38` ranks every medication/allergy/baseline/ongoing head before any keyword-matching event, then limits to forty. With forty such records, even an exact relevant symptom/result is absent from both chat and assessment context. Budget persistent context separately from question-relevant history and expose meaningful retrieval limits.

3. **Medium — clarification retries cannot resolve saved partial output.** `features/ai-chat/extraction/server.ts:202` reuses `job.output`; it invokes the model only when output is absent. Ambiguous and invalid items were already discarded by validation. Clicking retry consumes another attempt while preserving the same issues, until the five-attempt ceiling. There is no operation here to supply clarification or regenerate/version the held output. Separate write retries from clarification/re-extraction.

4. **Medium — held document extraction has no resolution path in the patient UI.** `features/ai-chat/extraction/status-view.tsx:33` offers actions for queued/partial/failed/running, excluding held. The processor claim at `features/ai-chat/extraction/server.ts:178` also excludes held. Wrong/uncertain-patient documents remain held without a visible authorized review or clarification operation. Retaining the original is correct; the missing workflow is the issue.

5. **Medium — old conversations become undiscoverable.** `features/ai-chat/server.ts:57` returns only thirty conversations without a cursor. Both selectors/navigation consume that list. Creating a thirty-first conversation removes an older conversation from the supported discovery UI despite durable storage. Add conversation-list pagination.

6. **Medium — old documents become undiscoverable.** `features/documents/server.ts:93` returns fifty documents without pagination. The documents screen has no older-page action, so older originals and processing states disappear from this workflow.

7. **Medium — processing failures disappear from the recovery UI.** Extraction status returns the latest fifty jobs (`features/ai-chat/extraction/server.ts:99`) and renders only the first ten (`features/ai-chat/extraction/status-view.tsx:25`). There is no paging or unresolved-first filter. New successful messages can push an unfinished or failed job out of the only visible retry list.

8. **Medium — extracted medication use loses structured use status.** The extraction schema captures generic active/resolved status and medication name, but `features/ai-chat/extraction/server.ts:280` writes only text/bodySite/contextLinks. It never supplies `body.medication`. `features/health-records/current-state.ts:9` consequently presents current use as unknown even for a clear report of taking/stopping a named medicine. Preserve explicit actual use separately from generic event status and prescription plans.

9. **Medium — extracted test results are classified as documents.** `features/ai-chat/extraction/server.ts:261` maps category result to document. Contributions inherit source category, so result filtering and category-specific downstream behavior cannot identify these as results. Preserve patient-uploaded source status while storing the correct clinical category.

10. **Medium — valid maximum-length document quotes fail contribution validation.** Extracted quotes allow 500 characters, but `features/ai-chat/extraction/server.ts:295` prepends `Page N: ` before passing a span to the 500-character schema limit in `features/health-records/schema.ts`. A valid 500-character quote then repeatedly fails saving. Keep page metadata separate or validate the complete encoded span consistently.

11. **Medium — a history-refresh failure prevents generation after a successful send.** `features/ai-chat/chat-view.tsx:147-152` clears the input and request key, then awaits history before starting extraction/generation. If that GET fails, the saved message has neither operation started by this client and no immediate retry control until history is recovered. Start those operations from the successful send result and handle display refresh independently.

12. **Medium — organization staff do not receive care-event notifications.** `supabase/migrations/20261011195456_practitioner_audit_hardening.sql:14` targets patient accounts and `c.practitioner_account_id`; organization connections have no direct practitioner recipient. It does not fan out to authorized assigned staff. `features/practitioner/daily.ts:63` also filters notifications to direct practitioner ownership. Organization worklists therefore lack these event notifications. Preserve explicit context and minimum disclosure when selecting staff recipients.

13. **Medium — Today silently omits patients and is not bounded to today.** `features/practitioner/daily.ts:13` inspects only thirty active direct connections and has no continuation. A pending appointment/message/request on later patients does not appear. Its appointment query at line 26 includes everything from the preceding twenty-four hours into the unlimited future, capped at fifteen per patient, rather than a timezone-specific day. Query actionable work across authorized connections with paging and explicit day bounds.

14. **Medium — advertised document limits do not describe processing limits.** The UI accepts and advertises text/PDF uploads up to 10 MB, but `features/documents/parser.ts:30,52` rejects text or combined extracted PDF content above 90,000 characters. A modest text file can upload successfully and then exhaust parser retries deterministically. Disclose and validate processing limits; distinguish unsupported/oversized content from transient parser failures.

15. **Medium — PDF quarantine promise exceeds the scanner's guarantees.** `features/documents/parser.ts:14` searches raw PDF bytes for literal action names. Encoded PDF names such as `/Java#53cript` are not decoded before matching. This does not establish the UI claim that all active PDFs are quarantined. No script execution exploit was tested or established; extraction does not intentionally execute PDF actions. Use parsed structural inspection or an actual quarantine/scan service, and qualify the UI statement.

16. **Medium — current typecheck is broken by generated development declarations.** `pnpm typecheck` exited 2 with TS1127 invalid-character errors in `.next/dev/types/root-params.d.ts`. `tsconfig.json` includes this generated directory. This is a local generated-artifact failure, not proof that tracked TypeScript source has those errors. WORKFLOW records an earlier occurrence, so reproducible generation/check setup needs attention. No cache repair was made during this audit.

## Verification and remaining gates

Follow-up: finding11 was reproduced and fixed in the owner-requested chat investigation. Retry reply visibility was also corrected. A separate live synthetic first-send reproduced upstream503 on all three gateway attempts; this provider failure is distinct from finding11. See [investigation and evidence](../tasks/chat-first-send-2026-10-16.md). Other findings remain open for future work.

- Focused Vitest command: `pnpm exec vitest run tests/unit tests/ai-gateway-retry.test.ts tests/auth-pkce.test.ts tests/local-auth-origin.test.ts tests/temporary-auth-debug.test.ts`: **18/18 passed, six files**.
- Typecheck: failed as finding 16 describes. No claim of a successful current production build.
- `pnpm lint`: passed, exit 0.
- No full native PostgreSQL/Keycloak/live-provider suite, authenticated browser journey, hosted advisor rerun, migration rehearsal, restore drill or clinical review was performed. Historical passing evidence in WORKFLOW is distinct from this audit.
- WORKFLOW explicitly leaves T32–T36 unstarted: cross-context integration, operations/reviews, migration rehearsal, release acceptance and portable handover. SMTP/inbox acceptance and named clinical/identity/data-handling review outcomes remain recorded gaps, not newly discovered code exploits.
- WORKFLOW contains superseded statements (for example the earlier unwired clinician model and old checkout/provider instructions). Its newest sections resolve some, but extracting a concise authoritative current-state section would reduce maintenance mistakes.
- Existing owner changes at audit start: WORKFLOW.md and app/globals.css. Neither was modified by this audit.
