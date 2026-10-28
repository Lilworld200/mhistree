# T24 maintenance: editable findings and durable practitioner conversation

Date:2026-10-28. Status: implemented; focused verification passed. Production webpack build compiled, typechecked and generated66 pages; final noEmit TypeScript, targeted ESLint, whitespace check and built-client secret/canary scan passed. Branch:codex/talk-mhistree-reviewed-findings. Source is uncommitted and not deployed.

## Goal and read packet

Replace text-only Talk to Mhistree proposals with one editable card containing multiple explicit findings, reuse Care Notes fields and persist the ongoing practitioner/patient/context conversation. Read AGENTS/WORKFLOW, playbook T21/T22/T24 and maintenance/acceptance appendices, practitioner and clinical-care owners, ai-proposal/practitioner/ai-entry/work/entries/care-note schemas, both workspace transports and their tests. Preserve the existing private-note boundary and human authority; this is not an autonomous clinical extraction/publishing path.

## Contracts and files

- patient-assistant.tsx selects talk-assistant.tsx for the ordinary workspace. LegacyPatientAssistant remains the existing inbox-origin capture consumer; its tests explicitly target that path. Four new UI tests target the actual default wrapper.
- care-record-fields.tsx extracts the existing medication, condition, allergy, baseline, symptom, activity and observation inputs, also used by care-notes-view.tsx. practitioner-review-card.tsx prefills source fields, maintains independent private text, includes/excludes findings, offers native radio destinations and validates via careNoteInput. A practitioner can continue typing at any point.
- practitioner.ts still uses one selected generation call, exact practitioner quotations, current authorized evidence and permission rechecks. Its prompt prepares incomplete multi-finding proposals rather than interrogating with every missing field. Structured names/regimen/indication/reaction/value/unit must be exact practitioner-supplied strings. A suspected source cannot prefill confirmed certainty. Unreviewed stage metadata cannot be supplied as conversational history.
- practitioner-chat.ts exports practitionerChatHistory, preparePractitionerReview and confirmPractitionerReview. Both workspace routes expose GET view=ai-chat plus POST ai-review and ai-review-confirm, with existing authenticated/CSRF guards. Initial-care and patient contexts cannot use these AI actions.
- History returns30 normal turns, a microsecond-preserving cursor and an optional prepared draft. Private immutable stages are excluded from conversation text/history and do not invoke a second model. Stage IDs are the immutable review versions; they expire after five minutes. Only the latest server-owned version can confirm. A different completed message/review invalidates it. Local edits/topic changes clear typed approval binding. Reopened prepared drafts restore exact fields and the version only while unexpired; unsent unstaged edits remain component-local.
- Confirmation validates all included fields/categories derived from the owned run. One transaction performs saveCareNoteInAccess for each finding, work/source/timeline/state changes, medication recommendation synchronization, the normal practitioner text and deterministic receipt. Prescription precedes separately explicit taking to keep recommendation workflow accurate. Stable item keys, author/context advisory serialization and receipt lookup prevent duplicate publication on retry; already-consumed proposals conflict. A rejected item rolls back all other findings and text. The generated run, review version and attributed approval-message ID remain linked in AI provenance. Original source event precision is retained unless the practitioner explicitly replaces the event date.

## Storage and isolation

No schema migration, new table, grant, provider switch, automatic fallback, extra routing call or hosted operation. Existing mhistree.practitioner_ai_runs remains immutable under its existing author/participation RLS. Normal questions and approved form text are question strings; proposals and private stages are separate response metadata. Clinical structured values retain the existing JSON body.careDetails and source/event lineage. Private notes never enter patient Health/timeline or shared summaries.

New rows are bound to exact author, connection, explicit direct/organization context, current consent revision and current per-category rights. History is withheld on changed scope; historical storage is retained. Older direct rows lacking the newer scope metadata can be recovered only under matching consent revision and full write authority for every readable category. Older organization rows lack enough assignment/scope evidence and stay withheld rather than being implicitly reauthorized. Existing patient-style sessions are not created. Model context remains the existing eight-turn/18000-character bound even though paginated display can load older messages. The existing history table has no new performance index; production-scale query tuning is separate work.

## Verification

Commands:

```
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js features/ai-chat/practitioner.ts features/clinical-care/care-notes-view.tsx features/clinical-care/care-record-fields.tsx features/clinical-care/care-notes.ts features/clinical-care/practitioner-chat.ts features/clinical-care/practitioner-review-card.tsx features/practitioner/talk-assistant.tsx features/practitioner/patient-assistant.tsx app/api/practitioner/workspace/route.ts app/api/organizations/workspace/route.ts tests/talk-assistant-ui.test.ts tests/integration/practitioner-chat-review.test.ts tests/integration/practitioner-ai-entry-http.test.ts tests/patient-assistant-ui.test.ts
node node_modules/vitest/vitest.mjs run tests/integration/practitioner-chat-review.test.ts tests/integration/practitioner-ai-entry.test.ts tests/integration/practitioner-ai-entry-http.test.ts tests/integration/care-notes-form.test.ts tests/integration/care-notes-http.test.ts tests/talk-assistant-ui.test.ts tests/care-notes-ui.test.ts tests/patient-assistant-ui.test.ts --maxWorkers=1
node node_modules/next/dist/bin/next build --webpack
node scripts/check-client.mjs
```

Native PostgreSQL tests run outside the Windows sandbox because embedded pg_ctl cannot create a restricted token inside it. All fixtures are synthetic/disposable. Final focused regression:8 files/46 tests passed. Covers a condition plus prescription, editable missing fields, concurrent retry, atomic failure, exact occurrence time, actual use separated/linked, author/private/patient isolation, narrowed privilege, organization membership removal, legacy direct recovery, expired/superseded review, pagination with multiple rows in one millisecond and actual guarded HTTP publication/history. UI tests cover the default Talk component, altered dose transport, bound typed approval, unbound okay, typed clarification and failure retaining input. Prior Care Notes form/native/HTTP and legacy inbox capture regressions pass.

Browser: ignored .local/talk-assistant-preview.cjs bundles the actual default component with synthetic API fixtures, no live account/database/provider. Measured desktop card688.8px, scroll687px, two317.6px field columns; mobile390px viewport card319.2px, scroll318px, one281.6px column. Native interaction verified Review message produces a readable message preview and Send replaces the review with an ordinary attributed practitioner text/receipt. This is component/responsive evidence using fallback Arial/reset, not authenticated production rendering or real-device certification. The preview is stopped after checks.

Initial regression exposed a changed conflict error and an assertion expecting adjacent medicine/dose despite multi-line formatting; corrected the conflict ordering and asserted each actual value. The final46-test run passes. No clinical conclusions, real care messages or patient writes were made.

Remaining verification: actual provider generation quality, authenticated deployed UI and real devices. User can test/redeploy source through the normal workflow; no migration is needed. Inbox-origin captures intentionally retain their existing per-item presentation in this request.
