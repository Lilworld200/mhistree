# T06–T36 bounded implementation packets

Planning revision 2026-10-09. Every packet below is **not-started**; no listed target file is presumed to exist. WORKFLOW is the sole acceptance ledger. These packets supplement, never replace, the full PDF task page (task number + 8) and Appendices A–D.

## Common execution contract

For each task read AGENTS.md, WORKFLOW.md, docs/feature-map.md, the complete relevant playbook page, the owning feature README once created, the paths below and direct dependencies. UI work also reads UI_GUIDE/component-catalog. All file paths are relative to the isolated new application; paths under legacy reuse must be read from the preserved old checkout. Missing prerequisite files are blockers, not permission to invent their presence.

Split each packet into .1 contract/schema/service, .2 consumer/UI/integration, .3 verification/handoff, in that order; for operational/documentation tasks these mean procedure, exercise, evidence. Before .1 rerun the previous gate's actual recorded smoke/contract commands and inspect git changes. No command result exists yet for T06+. T06 must establish real scripts before later packets name invocations. Add each owner's README plus targeted tests with public operations, schema ownership, callers and failure locations.

Every packet inherits errors from the two v1 contracts: deny current unauthorized access; retain originals/input on provider/parser failure; return explicit conflicts; bounded idempotent retry; never fake success. Expected output is implemented capability plus positive/negative evidence, not just files. Save actual commands/environment/expected/observed results to docs/tasks/Txx-evidence.md, update WORKFLOW and map at the boundary. UI packets compare recorded viewports and states. Any failed required gate blocks dependent work; independent documentation may continue with caveat.

## T06 — Clean foundation

- Status: not-started. Owner: shared UI/infrastructure.
- Prerequisites: T03 visual reproduction; T04/T05 planning. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/design/UI_GUIDE.md`, `docs/audit/current-state.md`, `docs/migration-plan.md`, `package.json`, `app/globals.css`.
- Create/change targets: `app/layout.tsx`, `app/globals.css`, `app/error.tsx`, `components/layout/app-shell.tsx`, `components/ui/button.tsx`, `lib/env.ts`, `lib/db/client.ts`, `lib/ai/gateway.ts`, `package.json`, `pnpm-lock.yaml`, `.env.example`, `tests/smoke/foundation.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Create pinned isolated shell; adapt inspected primitives without business mocks; add typed server-only env and truthful loading/error/unavailable states; add runners/scripts.
- Positive/negative gate: Fresh install/type/lint/build; mobile/desktop comparison; missing env fails safely; no server secret in client bundle; error boundary retry.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: All later UI; T07. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 14, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T07 — People and identifiers

- Status: not-started. Owner: identity.
- Prerequisites: T06. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/contracts/identity-access.md`, `docs/decisions/stack.md`, `lib/db/client.ts`.
- Create/change targets: `features/identity/schema.ts`, `features/identity/server.ts`, `features/identity/server.test.ts`, `supabase/migrations/<timestamp>_identity.sql`, `tests/fixtures/identity.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Separate person/account/contact/aliases; store unknown demographics; controlled lookup/registration with provenance; reserve merge lineage.
- Positive/negative gate: No-contact no-account care reference; alias uniqueness; similar names/shared phones never auto-link; guessed ID returns no history.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T08,T20,T28,T31. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 15, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T08 — Contactless auth core

- Status: not-started. Owner: auth.
- Prerequisites: T07; real isolated provider instance. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/decisions/stack.md`, `docs/contracts/identity-access.md`, `features/identity/server.ts`.
- Create/change targets: `features/auth/schema.ts`, `features/auth/server.ts`, `lib/auth/provider.ts`, `features/auth/server.test.ts`, `docs/contracts/auth.md`, `supabase/migrations/<timestamp>_auth.sql`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Run stack spike; implement setup/replacement/recovery/session retirement and reconciliation; rate-limit/non-enumerate; document actual provider behavior.
- Positive/negative gate: Real username/password no-contact flow; one concurrent redemption winner; expired/replaced/replayed deny; old JWT fails; staff cannot set password.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T10,T29,T31. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 16, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T09 — Access audit and atomic kernel

- Status: not-started. Owner: access/audit/health-records.
- Prerequisites: T08. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/contracts/identity-access.md`, `docs/contracts/clinical-records.md`, `features/auth/server.ts`, `features/identity/server.ts`.
- Create/change targets: `features/access/schema.ts`, `features/access/policy.ts`, `features/access/server.ts`, `features/audit/server.ts`, `features/health-records/schema.ts`, `features/health-records/repository.ts`, `features/health-records/server.ts`, `tests/integration/kernel.test.ts`, `supabase/migrations/<timestamp>_kernel.sql`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Implement organization-capable policy projections/consent and initial-care; atomic event/state/audit/outbox; protect exposed database/storage; narrow job authority.
- Positive/negative gate: Tampered IDs/roles and cross-org/private/draft reads deny; current revocation; transaction rollback; replay one write; independent paths stay separate.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: Every consumer; T27,T31,T32. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 17, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T10 — Patient account entry

- Status: not-started. Owner: patient/auth.
- Prerequisites: T09. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/contracts/auth.md`, `features/auth/server.ts`, `features/identity/server.ts`, `docs/design/UI_GUIDE.md`.
- Create/change targets: `features/patient/account/account-view.tsx`, `features/auth/components/setup-form.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/setup/page.tsx`, `tests/e2e/account.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Build registration/login/logout/setup/contact UI; claim existing person; render token errors/recovery directions; retain separate contact verification.
- Positive/negative gate: Real signup/claim refresh/logout/login; optional contacts; duplicate-submit safe; protected direct URL denied; mobile/keyboard compare.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T11,T29. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 18, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T11 — Durable patient chat

- Status: not-started. Owner: ai-chat/patient.
- Prerequisites: T10. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/contracts/clinical-records.md`, `features/auth/server.ts`, `features/access/server.ts`, `lib/ai/gateway.ts`.
- Create/change targets: `features/ai-chat/schema.ts`, `features/ai-chat/server.ts`, `features/ai-chat/worker.ts`, `features/ai-chat/components/chat-view.tsx`, `features/patient/home/home-view.tsx`, `app/api/chat/route.ts`, `tests/integration/chat.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Persist source before generation; explicit AI reply kind; durable extraction outbox; idempotent send/history and cancellation/retry; elapsed gaps.
- Positive/negative gate: Reload durable history; duplicate send one message; failed generation retains input; cross-patient session denial; AI output never fact.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T12,T16. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 19, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T12 — Temporal report extraction

- Status: not-started. Owner: health-records.
- Prerequisites: T11,T09. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/contracts/clinical-records.md`, `features/ai-chat/server.ts`, `features/health-records/server.ts`.
- Create/change targets: `features/health-records/extraction.ts`, `features/health-records/time.ts`, `features/health-records/extraction.test.ts`, `tests/fixtures/reports.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Validate model schema/source spans; anchor time; classify report versus hypothetical; link activity/symptom; clarify ambiguity; stable item IDs and partial statuses.
- Positive/negative gate: Running/pain no causation; other-leg clarification; unknown drug; midnight/timezones; approximate month; hypothetical/third-party exclude; replay no duplicates.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T13,T14,T15. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 20, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T13 — Private originals and extraction

- Status: not-started. Owner: documents.
- Prerequisites: T12; isolated private storage/parser. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/contracts/clinical-records.md`, `features/health-records/extraction.ts`, `features/access/server.ts`, `docs/design/component-catalog.md`.
- Create/change targets: `features/documents/schema.ts`, `features/documents/server.ts`, `features/documents/worker.ts`, `lib/jobs/worker.ts`, `features/documents/components/documents-view.tsx`, `lib/storage/private.ts`, `app/api/documents/[id]/content/route.ts`, `tests/integration/documents.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Validate formats/limits/quarantine; persist checksum/original first; durable partial jobs; source page/spans; current preview/download authority.
- Positive/negative gate: Parser outage original intact; retry no duplicate; wrong patient and unclear units held; unauthorized preview fails; document prompt injection inert.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T14,T16,T23. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 21, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T14 — Source-linked timeline

- Status: not-started. Owner: health-records/patient.
- Prerequisites: T13. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/health-records/server.ts`, `features/documents/server.ts`, `docs/contracts/clinical-records.md`, `docs/design/UI_GUIDE.md`.
- Create/change targets: `features/health-records/components/timeline-view.tsx`, `features/health-records/timeline.ts`, `app/(patient)/timeline/page.tsx`, `tests/integration/timeline.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Keyset filters/pagination; explicit unknown time; attribution/source links; latest and retained versions; responsive empty/error states.
- Positive/negative gate: No skips/duplicates with snapshot pagination; exact/approximate/unknown distinct; correct original links; revoked source denies.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T15,T21. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 22, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T15 — Persistent state and corrections

- Status: not-started. Owner: health-records.
- Prerequisites: T14,T09. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/health-records/server.ts`, `features/health-records/timeline.ts`, `docs/contracts/clinical-records.md`.
- Create/change targets: `features/health-records/state.ts`, `features/health-records/corrections.ts`, `features/health-records/components/health-summary.tsx`, `app/(patient)/health/page.tsx`, `tests/integration/corrections.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Source-linked medication use/allergy/baseline/issues; last-known/unknown; retained patient revision; professional disagreement queue; atomic expected-version write.
- Positive/negative gate: Left/right correction keeps source; prescription versus use separate; stale silence not cure/adherence; professional edit denied; conflict/rollback.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T16,T22. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 23, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T16 — Grounded retrieval and assessment

- Status: not-started. Owner: ai-chat.
- Prerequisites: T15. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/health-records/state.ts`, `features/health-records/timeline.ts`, `features/documents/server.ts`, `docs/contracts/clinical-records.md`.
- Create/change targets: `features/ai-chat/retrieval.ts`, `features/ai-chat/assessment.ts`, `features/ai-chat/worker.ts`, `tests/evals/assessment.test.ts`, `tests/fixtures/evidence.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Filter before rank; retrieve timing/spans/gaps/conflicts; version indexes; separate support/urgency; assessment only in chat; recheck delivery.
- Positive/negative gate: Actual source citations; insufficient evidence limits; old symptoms not current; no private/revoked leakage; extraction gap disclosed; no diagnosis writes.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T24,T32. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 24, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T17 — Patient access and account controls

- Status: not-started. Owner: access/patient.
- Prerequisites: T16,T09. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/access/server.ts`, `features/auth/server.ts`, `docs/contracts/identity-access.md`.
- Create/change targets: `features/access/components/patient-controls.tsx`, `features/patient/account/export.ts`, `features/patient/account/requests.ts`, `app/(patient)/sharing/page.tsx`, `tests/integration/patient-controls.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Separate direct/org grants; approve/narrow/revoke/reconnect; access history; private export; review requests; label fixture producers.
- Positive/negative gate: Org revoke preserves independent direct; scope narrowing applies next read; in-person consent review after activation; export private; closure not delete.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T20,T27,T32,T33. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 25, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T18 — Patient phase and care surfaces

- Status: not-started. Owner: patient/appointments/messaging/clinical-care.
- Prerequisites: T10–17 verified. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/patient/README.md`, `docs/contracts/clinical-records.md`, `features/access/server.ts`.
- Create/change targets: `features/appointments/schema.ts`, `features/appointments/server.ts`, `features/messaging/schema.ts`, `features/messaging/server.ts`, `features/patient/components/appointments-view.tsx`, `features/patient/components/inbox-view.tsx`, `features/patient/components/requests-view.tsx`, `tests/e2e/patient-journey.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Durable booking/timezone/overlap; participant text threads; request/status views; real patient journey; freeze service APIs; label pending producer screens.
- Positive/negative gate: Real persistence/AI core journey; booking/message transactions; unauthorized threads deny; unavailable producers explicit; visual match; external blockers stay blocked.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T19,T23,T25,T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 26, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T19 — Practitioner profile verification

- Status: not-started. Owner: practitioner.
- Prerequisites: T18 gate. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/auth/server.ts`, `features/access/policy.ts`, `docs/contracts/identity-access.md`, `tests/e2e/patient-journey.spec.ts`.
- Create/change targets: `features/practitioner/schema.ts`, `features/practitioner/server.ts`, `features/practitioner/components/profile-view.tsx`, `app/(review)/review/practitioners/page.tsx`, `tests/integration/qualification.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Extend one account; private credential submission and restricted manual review; statuses/evidence; protected workspace routing.
- Positive/negative gate: Pending/suspended clinical action denied; self-verification denied; approved one-account workspace; unauthorized reviewer denied.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T20,T27. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 27, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T20 — Direct connections and registration

- Status: not-started. Owner: practitioner/access/identity.
- Prerequisites: T19,T17. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/identity/server.ts`, `features/access/server.ts`, `features/practitioner/server.ts`.
- Create/change targets: `features/practitioner/components/patients-view.tsx`, `features/practitioner/components/consent-form.tsx`, `features/practitioner/registration.ts`, `tests/e2e/direct-connection.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Controlled lookup/My patients; login or in-person scope consent; no-contact registration; revoke/reconnect; reserve explicit org selector contract.
- Positive/negative gate: Approved consent shows permitted history; locator alone no history; unverified grant denied; in-person no-login works; patient controls reflect.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T21,T27. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 28, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T21 — Practitioner records and private work

- Status: not-started. Owner: clinical-care/practitioner.
- Prerequisites: T20. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/health-records/server.ts`, `features/access/policy.ts`, `docs/contracts/clinical-records.md`.
- Create/change targets: `features/clinical-care/schema.ts`, `features/clinical-care/server.ts`, `features/clinical-care/components/private-notes.tsx`, `features/practitioner/components/patient-record-view.tsx`, `tests/integration/private-work.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Compose permitted baseline/history; separate notes/reminders/drafts; show acting context; clear on revoke; document AI private-input boundary.
- Positive/negative gate: Other practitioner/patient private read denied; team only permitted drafts; revoked author cannot reopen; org context impersonation denied.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T22,T24. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 29, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T22 — Finalize and correct clinical care

- Status: not-started. Owner: clinical-care/health-records.
- Prerequisites: T21,T15. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/clinical-care/server.ts`, `features/health-records/server.ts`, `docs/contracts/clinical-records.md`.
- Create/change targets: `features/clinical-care/entries.ts`, `features/clinical-care/components/entry-editor.tsx`, `tests/integration/finalization.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Draft findings and prescription records; current-authority finalization; atomic event/state; visible patient final care; retained minor/material corrections; paused review.
- Positive/negative gate: Replay no duplicate; revoked finalization denied; patient cannot overwrite; concurrent correction conflict; history preserved and patient sees final.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T23,T28. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 30, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T23 — Narrow service requests/results

- Status: not-started. Owner: clinical-care.
- Prerequisites: T22,T18. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/clinical-care/entries.ts`, `features/documents/server.ts`, `features/patient/components/requests-view.tsx`, `docs/contracts/clinical-records.md`.
- Create/change targets: `features/clinical-care/requests.ts`, `features/clinical-care/components/request-view.tsx`, `features/clinical-care/components/result-editor.tsx`, `tests/integration/results.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Explicit recipient/basis/priority; allowed transitions; verify privilege; new versus corrected result; pause and explicit review/resume.
- Positive/negative gate: Patient status/final result; unauthorized recipient deny; corrected retains prior; repeat separate; revoked publish deny; independent basis narrow.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T25,T28. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 31, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T24 — Practitioner AI with human review

- Status: not-started. Owner: ai-chat/clinical-care.
- Prerequisites: T23,T16,T21. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/ai-chat/retrieval.ts`, `features/clinical-care/server.ts`, `features/clinical-care/entries.ts`.
- Create/change targets: `features/ai-chat/practitioner.ts`, `features/practitioner/components/ai-assistant.tsx`, `tests/evals/practitioner.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Reuse retrieval; explicit author-only private context; editable labeled suggestions; deliberate human finalization; current delivery check.
- Positive/negative gate: Source-supported summaries; injected instructions inert; private notes isolated; no self-finalize; revoked in-flight output withheld.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T25,T32. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 32, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T25 — Direct-care daily work and gate

- Status: not-started. Owner: practitioner/appointments/messaging.
- Prerequisites: T24,T18. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/appointments/server.ts`, `features/messaging/server.ts`, `features/clinical-care/requests.ts`.
- Create/change targets: `features/practitioner/components/today-view.tsx`, `features/practitioner/components/availability-view.tsx`, `features/practitioner/components/inbox-view.tsx`, `lib/jobs/notifications.ts`, `tests/e2e/direct-care.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Today/reminders; real provider booking and text producers; durable minimal notifications; full connection-to-result journey.
- Positive/negative gate: Double booking deny; unauthorized thread deny; revoked new work deny; notifications replay dedup; patient sees final results through real screens.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T26,T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 33, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T26 — Organization registration/approval

- Status: not-started. Owner: organizations.
- Prerequisites: T25 gate. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/access/policy.ts`, `features/practitioner/server.ts`, `tests/e2e/direct-care.spec.ts`.
- Create/change targets: `features/organizations/schema.ts`, `features/organizations/server.ts`, `features/organizations/components/registration-view.tsx`, `app/(review)/review/organizations/page.tsx`, `tests/integration/organization-approval.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Manual org review/evidence; verify initial admin; statuses; management-only privilege; shell and audit notifications.
- Positive/negative gate: Pending/suspended clinical action deny; cannot self-approve/claim org; admin manages only own org and cannot browse records.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T27. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 34, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T27 — Membership assignments and context

- Status: not-started. Owner: organizations/access.
- Prerequisites: T26,T20,T09. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/organizations/server.ts`, `features/access/policy.ts`, `features/practitioner/components/patients-view.tsx`.
- Create/change targets: `features/organizations/membership.ts`, `features/organizations/assignments.ts`, `features/organizations/components/staff-view.tsx`, `features/access/components/context-selector.tsx`, `tests/integration/assignments.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Staff invite/privileges; org consent producer; qualified assignments; explicit contexts and cache separation; remove/suspend invalidation.
- Positive/negative gate: Cross-org and excluded-category deny; admin cannot finalize; remove org preserves direct; patient sees org consent; no privilege union.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T28,T29,T32. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 35, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T28 — Organization care producers

- Status: not-started. Owner: organizations/clinical-care/identity.
- Prerequisites: T27. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/identity/server.ts`, `features/organizations/assignments.ts`, `features/clinical-care/entries.ts`, `features/clinical-care/requests.ts`.
- Create/change targets: `features/organizations/components/patient-registration.tsx`, `features/organizations/components/worklist.tsx`, `features/organizations/components/results-view.tsx`, `tests/e2e/organization-care.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): No-contact registration and provisional matches; initial-care basis; shared draft/final/result services; named human contributors; pause queues.
- Positive/negative gate: Unactivated care persists; other-provider history inaccessible; assignments restrict action; each result human-attributed; no hospital-ops expansion.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T29,T30,T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 36, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T29 — Assisted activation and recovery UI

- Status: not-started. Owner: auth/organizations.
- Prerequisites: T28,T08. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/auth/server.ts`, `docs/contracts/auth.md`, `features/organizations/membership.ts`.
- Create/change targets: `features/organizations/components/identity-assistance.tsx`, `features/auth/components/recovery-review.tsx`, `app/(review)/review/identity/page.tsx`, `tests/e2e/assisted-recovery.spec.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Identity evidence/privilege; private issuance; separate replacement/recovery; patient password; uncertain ownership escalation.
- Positive/negative gate: No-contact end-to-end; ordinary staff denied; replay/replacement/expiry; old sessions deny; no secrets in logs/worklists; staff never knows password.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T30,T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 37, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T30 — Duplicate review

- Status: not-started. Owner: identity.
- Prerequisites: T29. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/identity/server.ts`, `features/auth/server.ts`, `docs/contracts/identity-access.md`.
- Create/change targets: `features/identity/duplicates.ts`, `features/identity/components/duplicate-review.tsx`, `tests/integration/duplicates.test.ts`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Limited candidates/flagging; designated reviewer evidence; keep provisional care; activated ownership checks; survivor/access preview.
- Positive/negative gate: Wrong-person candidate no history; ordinary staff cannot approve; uncertain ownership blocks merge; patient-login evidence excludes staff edits.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T31. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 38, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T31 — Non-expanding merge/reversal

- Status: not-started. Owner: identity/access/auth.
- Prerequisites: T30,T09. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `features/identity/duplicates.ts`, `features/access/policy.ts`, `features/auth/server.ts`, `docs/contracts/identity-access.md`.
- Create/change targets: `features/identity/merge.ts`, `features/identity/reversal.ts`, `features/identity/components/merge-preview.tsx`, `tests/integration/merge.test.ts`, `supabase/migrations/<timestamp>_merge_journal.sql`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Lock/idempotency/survivor; journal origins/grants/mappings; retire losing sessions/tokens; aliases; invalidate indexes; review later records in reversal.
- Positive/negative gate: All survivor cases/ties; replay/concurrency/rollback; disjoint grants never union; no originals lost; old session denied; reversal with later records.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T32,T34. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 39, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T32 — Cross-context and revocation integration

- Status: not-started. Owner: access/all consumers.
- Prerequisites: T31. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/feature-map.md`, `docs/contracts/identity-access.md`, `docs/contracts/clinical-records.md`, `features/access/policy.ts`.
- Create/change targets: `tests/integration/access-consumers.test.ts`, `tests/e2e/revocation.spec.ts`, `docs/testing/access-matrix.md`, `owning policy/service files identified by failures`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Enumerate every consumer; revoke live/cache/job/stream; test pause/review/resume; explicit independent paths; suspend/narrow/merge/correct indexes; repair shared owner.
- Positive/negative gate: Every consumer positive+negative evidence; no stale protected delivery; preserve stored work; no automatic resume/fallback; downloaded-copy limitation honest.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T33,T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 40, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T33 — Operations and required reviews

- Status: not-started. Owner: audit/operations/patient.
- Prerequisites: T32. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/testing.md`, `lib/jobs/worker.ts`, `features/patient/account/requests.ts`, `features/audit/server.ts`.
- Create/change targets: `docs/operations.md`, `features/audit/components/operations-view.tsx`, `lib/jobs/retry.ts`, `tests/integration/recovery.test.ts`, `docs/release/reviews.md`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Safe metrics/logs; bounded retry/dead-letter/manual retry; DB+original backup restore; request review queue; named clinical/identity/data/explanation reviewers.
- Positive/negative gate: Parser outage recovery no duplicates/loss; restore record+file checksum; support no broad browsing; unresolved review owners/outcomes explicitly block launch.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T34,T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 41, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T34 — Migration rehearsal

- Status: not-started. Owner: identity/operations.
- Prerequisites: T33; authorized non-production data. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `docs/migration-plan.md`, `docs/operations.md`, `docs/audit/current-state.md`, `new schema and origin contracts`.
- Create/change targets: `scripts/migration/inventory.ts`, `scripts/migration/import.ts`, `scripts/migration/reconcile.ts`, `docs/release/migration-rehearsal.md`, `docs/release/cutover.md`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Inventory actual data separately; map/quarantine; idempotent dry run; compare relationships/checksums/permissions; auth/session rehearsal; rollback/write strategy.
- Positive/negative gate: No unexplained loss/duplicates/grants; replay safe; rollback usable; no-data import N/A only with evidence; production separate authorization.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T35. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 42, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T35 — Integrated release acceptance

- Status: not-started. Owner: all owners.
- Prerequisites: T34; all required implementation/review gates. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `WORKFLOW.md`, `docs/testing.md`, `docs/release/reviews.md`, `docs/release/migration-rehearsal.md`, `docs/design/UI_GUIDE.md`.
- Create/change targets: `docs/release/acceptance.md`, `tests/e2e/integrated.spec.ts`, `docs/release/known-limitations.md`, `failed owning modules`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Appendix D through actual producer screens; direct API misuse/concurrency/outages; visual/accessibility; limits and recovery; resolve blockers.
- Positive/negative gate: All 10 scenarios reproducible with real integrations; no mock-only core; named review sign-offs; source/access/identity/visual invariants; no deployment implied.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: T36. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 43, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.

## T36 — Portable handover

- Status: not-started. Owner: documentation/all owners.
- Prerequisites: T35. Prior gate result: not yet run; verify previous task and direct dependencies before implementation.
- Read first (plus common packet): `AGENTS.md`, `WORKFLOW.md`, `docs/feature-map.md`, `all actual feature READMEs/contracts/runbooks/release evidence`.
- Create/change targets: `AGENTS.md`, `WORKFLOW.md`, `README.md`, `docs/handover.md`, `docs/design/asset-manifest.json`, `docs/tasks/archive.md`, `features/*/README.md`. Migration <timestamp> must become a unique ordered identifier at implementation; never duplicate the legacy 002 prefix.
- Ordered work/output (.1→.2→.3): Reconcile durable rules/status; link evidence; verify feature maps; clean setup/seed/test/migration/rollback/deploy; bounded patient-bug walkthrough and reconstruction.
- Positive/negative gate: Intermediate developer traces behavior; fresh agent uses brain/assets; no unsupported completed rows or hidden blockers; commands/links real; no secrets.
- Failure handling: apply common error contract; unresolved prerequisite/integration/review failure stays blocked and the failing owner is recorded. Do not replace this gate with mock-only success.
- Future consumers: Future maintenance. Handoff: public APIs/contracts, schema and policy changes, visual reference used, actual evidence and remaining gaps.
- Next safe action: read full PDF page 44, resolve existing target files and prerequisite evidence; execute .1 only when authorized and prerequisites pass.


