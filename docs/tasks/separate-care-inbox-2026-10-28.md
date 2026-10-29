Hosted rollout update2026-10-29: the migration below and the additive lookup-index migration are now applied to the app-configured mhistree project. [Deployment evidence and current limits](care-inbox-database-rollout-2026-10-29.md). The original implementation-time evidence below remains dated.

# Separate Care Inbox and reviewed capture

Date: 2026-10-28. Branch: `codex/separate-care-inbox`. Status: implemented and locally verified. Source is uncommitted. No hosted migration or deployment has been performed.

## Approved behavior and read packet

The owner replaced the temporary combined patient AI/care presentation with a dedicated human inbox. Every practitioner inbox shortcut, including the patient-profile/Health-area shortcut, must navigate to `/clinician/inbox`. Patient reports may be captured automatically as patient-reported information. Both definite and suspected practitioner findings enter author review, preserving certainty; neither is automatically published. Relevant health-only handoffs remain patient-reviewed copies. Medication recommendations, actual use and clinical publication remain distinct.

Read AGENTS/WORKFLOW, T18/T21/T22/T24/T25 and maintenance/acceptance appendices, messaging/practitioner/clinical-care owners, existing connected-care and practitioner-review records, clinical/access contracts and the UI guide. Supabase skill and official RLS documentation were consulted. The changelog Markdown fetch was unsupported by the web reader; no new Supabase SDK/API behavior was assumed. The installed CLI created migration `20261028151612_separate_care_inbox.sql` after its help was inspected.

## Implementation

### Conversations and delivery

- `features/messaging/inbox.ts` and `inbox-view.tsx` back both dedicated inbox pages. They list currently eligible direct/organization contexts, read canonical 50-message pages, show human attribution and immutable reviewed health attachments, retain per-conversation unsent drafts and stable Send retry keys, and acknowledge only the displayed sequence. Organization connections remain shared care-team threads rather than being presented as private conversations with one staff member.
- `/api/care/inbox` provides list/thread/analysis reads and authenticated, mutation-guarded Send/read/analyze/finding/withdraw operations. Existing care services remain the durable message authority. New message `sender_context` provides source-role attribution; historical messages are retained without backfill.
- Private ChatView no longer imports the connected-care hook, displays care messages, offers direct-recipient mode or sends direct messages. The obsolete combined transport rejects mutations; canonical messages and historical placement metadata remain retained. Reviewed AI handoffs still use care-message confirmation, now with per-destination Open conversation links.
- Patient-profile inbox tiles are links. Old care anchors redirect to the inbox page. Workspace message sections contain an inbox link; the dedicated page owns conversation UI. Organization workspace Talk to Mhistree now uses the same durable reviewed assistant.

### Durable analysis and review

- A message transaction enqueues its job but does not invoke AI or perform patient clinical capture. Message/audit/outbox/job storage commit together. Failed analysis cannot undo delivered text.
- `schedule-analysis.ts` uses Next `after` for at most two queued/recoverable jobs per invocation. Inbox/Talk reads recover queued or expired-leased work under a fresh session check. There is no notification daemon, provider fallback or extra AI routing call. Failed/partial work requires explicit Retry. Same-author jobs in a thread wait for earlier queued/running messages; leases fence concurrent processors.
- `analysis.ts` uses one selected generation per uncached job. Context contains at most eight preceding human messages/8,000 characters, with explicit author roles. Practitioner analysis reuses the current authorized proposal generator without creating an automatic Talk turn. Exact supplied fields, source quotations, uncertainty and current permissions remain validated. Clear prescription names can create source-linked recommendation workflow metadata for patient follow-ups; no prescription or taking record follows from that metadata alone.
- Patient analysis reuses journal extraction validation, time interpretation and the atomic source/contribution kernel. `patient-analysis.ts` supplies bounded prior accepted patient inbox reports for same-report, correction and episode-update validation. Sources retain the original care-message author, content, timezone and capture instant. Known-medication commitments use the exact-question rules after delivery, without duplicating ordinary extraction. Recommended dose/duration never becomes reported actual use.
- `care_pending_findings` stores original source/job/author/patient/context references, scope, category, structured proposal, gaps and review state. It is not a clinical record. The job output and immutable AI runs retain prior source/proposal versions when a working proposal is clarified.
- `inbox-findings.tsx` displays author-only pending suggestions in Talk to Mhistree. Review explicitly materializes a normal attributed source turn and the existing editable card. Dismiss never writes Health. Typed clarification can retain the same pending item only when a unique current item matches category, identity and original source quotation; it updates the reviewed run binding instead of leaving a duplicate pending draft.
- Existing review-version expiry, exact typed Send binding, current-scope checks and atomic publication remain in force. Author/context advisory serialization prevents sibling review deadlocks and stale multi-device approval. Confirmation marks included candidates recorded/private in the same transaction as their ordinary attributed message and clinical/private saves; excluded findings remain pending.
- Recommendation `reviewed_event_id` links an eventual prescription to its original inbox recommendation, preserving already recorded patient use/disposition. A security-invoker trigger prevents a patient from setting or clearing that practitioner review link. Physician initiation-follow-up withdrawal remains available in the inbox. Contracted first-person reports such as “I've been taking…” are recognized without accepting hypotheticals or unrelated assent.

### Privacy and compatibility

- New tables use private-schema RLS, exact actor/acting-context checks, current participation/category authority, constrained runtime grants and no browser-role grants. Clinical publication uses the existing shared service; no RLS bypass or parallel clinical writer was introduced.
- Handoff memory items carry `healthRelevant`; only explicitly health-relevant items reach the editable transferable projection. Unrelated private preferences/life context remain in private memory. Existing summary entries without this flag are conservatively excluded from automatic handoff projection. Unchanged historical private snapshots are not bulk regenerated.
- Permission/connection changes withhold findings and publication. Changed-revision jobs stay paused rather than silently becoming authorized again. Pending storage and historical messages are retained. No private note or raw AI transcript is sent to recipients.
- Existing selected chat, independently configured speech/embeddings, per-medicine daily delivered-question receipts and stop conditions remain. No keys, provider selection or dependencies were changed.

## Verification and evidence

All databases below were disposable native PostgreSQL fixtures, with invented identities/messages. Windows native startup ran outside the sandbox because restricted-token pg_ctl startup is unsupported inside it. No real account was used for this implementation, and no further visual testing was performed.

- Final new native/HTTP acceptance: **15 passed, 1 opt-in live skip**, two suites. Covers independent delivery, unread sequence, pending definite/suspected findings, isolation, atomic concurrent replay, original source clocks, report clarification/version and later episode events, incomplete medicine/private-note paths, typed clarification linkage, queue ordering, sibling review races, patient denial of review-link edits, provider failure/retry and in-flight revocation. Log: `.local/separate-inbox-final-acceptance.log`.
- Focused native review/connected-care regression: **47 passed, 1 optional skip**, four suites. Log: `.local/separate-inbox-review-final.log`. Earlier broader seven-suite run had 65 passes and one legacy direct-mode test expecting synchronous patient capture. That test was moved to the standalone post-delivery path and passed in the later run. Existing Care Notes, practitioner HTTP, private continuity and reviewed handoff suites passed in the broader run.
- Final UI/unit regression: **43 passed**, nine suites. Includes standalone inbox delivery/retry/drafts/read acknowledgement, pending-review interactions, private-chat separation, practitioner navigation, original Talk/Care Notes, medication interpretation, reviewed handoff cards and private chat continuity. Log: `.local/separate-inbox-final-ui.log`.
- Selected live NVIDIA provider: **1 passed**, exercising two real generation requests on synthetic practitioner and patient inbox messages, then reviewed publication in the disposable database. Suspected condition and incomplete medicine became pending proposals; a patient symptom retained patient-reported source attribution. Log: `.local/separate-inbox-live.log`; synthetic-only model/output observations: `.local/separate-inbox/live-synthetic.json`. This is point-in-time integration evidence, not continuous provider availability or clinical certification.
- Standalone TypeScript and full repository ESLint passed. Production webpack build compiled, typechecked and generated **67 pages** in an isolated copy, preserving the running development cache. Client identifier/canary scan passed. All **267** compared production source/configuration/asset files matched that successful build. Log: `.local/separate-inbox-build-complete.log`.
- Initial UI failures were outdated response mocks/combined-panel expectations and were corrected to test the new contracts. Two summary fixtures needed explicit health relevance. An initial production build was blocked by sandbox font-download access; the authorized external build then exposed a missing root proxy in the isolated copy. Including the existing proxy resolved it. No application auth/font behavior was weakened to pass.

Representative commands:

```powershell
node node_modules/vitest/vitest.mjs run tests/integration/separate-inbox.test.ts tests/integration/separate-inbox-http.test.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run tests/integration/separate-inbox.test.ts tests/integration/separate-inbox-http.test.ts tests/integration/practitioner-chat-review.test.ts tests/integration/connected-care.test.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run tests/medication-recommendations.test.ts tests/inbox-ui.test.ts tests/talk-assistant-ui.test.ts tests/connected-care-ui.test.ts tests/patient-detail-ui.test.ts tests/care-notes-ui.test.ts tests/patient-assistant-ui.test.ts tests/care-action-card.test.ts tests/chat-continuity-ui.test.ts --maxWorkers=1
$env:MHISTREE_LIVE_SEPARATE_INBOX='1'
node node_modules/vitest/vitest.mjs run tests/integration/separate-inbox.test.ts -t 'selected live provider' --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js app features lib tests scripts
node node_modules/next/dist/bin/next build .local/separate-inbox-build --webpack
# From .local/separate-inbox-build:
node ../../scripts/check-client.mjs
```

## Rollout and remaining limits

Apply migration `20261028151612_separate_care_inbox.sql` before running/deploying this source against an existing database. It adds metadata/tables/guards without deleting or migrating existing clinical/chat data. Hosted schema/advisors, deployment and real-device/browser acceptance remain separate operations and were not performed.

Inbox discovery remains bounded at 100 eligible contexts; human history is paginated at 50 messages. Pending review shows the first 50 actionable findings; processing/dismissing them reveals later ones. Analysis status shows 50 recent own jobs, with durable older storage retained. Post-response work is bounded; a process interruption/session expiry can defer queued processing until a fresh authorized visit. No permanent worker or external notification guarantee is claimed. Review publication remains required for all practitioner findings even when message text is definite.
