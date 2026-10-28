# Missing care-message drafts and unsupported delivery claims — 2026-10-28

Status: source repair and focused local verification complete. The owner's hosted screenshots show workflow claims without a visible draft; the deployed revision and hosted patient conversation were not inspected or modified. No deployment or migration is included.

## Reproduced cause and repair

The preparation boundary recognised only its narrow standalone confirmation vocabulary, while the response text could still announce preparation after the structured action was discarded. Source tests reproduce this with synthetic contact offers followed by “okay do so”. Follow-up requests to find/reopen a missing draft could repeat model claims without creating a proposal. These findings explain a supported failure path, rather than certifying the exact deployed history.

- `health-context.ts` recognises preparation assent against the exact preceding single, unambiguous contact/preparation question, including clear question text when dialogue metadata is mislabeled. This does not expand the separate reviewed Send-answer vocabulary. Symptom answers, compound questions and intervening patient turns do not grant preparation consent. Recovery needs prior bounded patient authorisation; an assistant claim alone is insufficient. Workflow-control phrases are excluded from outbound patient quotations. Ordinary support text is not classified as a care operation merely because it says it was prepared.
- `server.ts` reads current stored workflow state before generation and rechecks proposal identity/version/state and delivery receipts at publication. Accepted preparation creates the private proposal atomically alongside its introducing reply. Observed unsupported draft/send assertions are replaced with wording tied to an actual proposal or receipts; urgent real-world-help advice is preserved. Recovery creates a previously missing proposal only with prior preparation consent, reuses saved edited drafts, and never repeats completed deliveries. Appointment suggestions cannot replace accepted message preparation without an explicit appointment request.
- `care-delivery.ts` provides a bounded own-account latest-proposal projection with retained delivery results. History exposes its unresolved draft separately from the paginated chat messages, without exposing private operation keys or changing clinical storage.
- `chat-view.tsx` shows an older unresolved proposal once near the latest reply, retaining the real editable review card and explicit Send. Older recovered cards do not arm a new typed Send against a different assistant message. The existing exact displayed-question/version/expiry/next-answer gate remains for typed confirmation on the original current review. Earlier-history loading preserves the pending-card projection.

Current recipient/scope/revision checks, source-grounded drafts, summary review, per-destination atomic delivery and idempotent results remain in the shared services. No automatic contact, clinical publication, provider switch, extra AI routing call, historical backfill or real-user sending was introduced. The latest existing connected-care migration remains a separate deployment prerequisite; this repair adds no migration.

## Verification

Read AGENTS/WORKFLOW, the contextual/reviewed-care task records, shared clinical-record contract, owning AI-chat implementation/README and playbook T18; the governing task/appendix contracts were previously inspected in this conversation.

Final checks:

- Five native PostgreSQL suites: **51 passed** (`care-draft-recovery`, `contextual-care`, `chat-care-actions`, `connected-care`, `chat-continuity`). These use disposable synthetic databases and controlled reply adapters, without live provider calls. New cases prove grounded preparation, no pre-review care message, edited-draft recovery, no duplicate proposal/send, receipt-based recovery after completion, access isolation, recovery beyond the 50-message page and urgent-advice preservation.
- Seven unit/jsdom suites: **37 passed** (`contextual-health`, `chat-draft-recovery-ui`, `chat-send-flow`, `care-action-card`, `connected-care-ui`, `care-action-grounding`, `chat-context-budget`). The real review card is rendered once for an older draft, retains edited text and saves only after explicit submission.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: passed.
- Targeted ESLint for changed source/tests: passed. Whitespace verification recorded in WORKFLOW.

Initial native attempts could not create PostgreSQL's restricted Windows token inside the sandbox (`pg_ctl` error87). The authorised outside-sandbox synthetic runs succeeded. Early regressions exposed a missing gerund form in offer recognition and test-only missing message IDs/reply anchors; both were corrected before the final runs. Existing safe introductory prose remains stored unchanged when there is a real proposal and no unsupported operational claim.

No authenticated production/browser or live-selected-provider reproduction is claimed, and no new production build was run. The checks establish local source/service/UI behaviour, not the state of the owner's existing hosted conversation. Deploy matching source normally; existing missing conversations can recover on a new draft-recovery request when their bounded prior patient authorisation is still available, otherwise a new explicit preparation request is required.
