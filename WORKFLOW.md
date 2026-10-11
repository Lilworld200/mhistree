# Mhistree execution memory

Revision: 2026-10-11 (Africa/Lagos). Authorized scope: T10–T18 patient first, on top of verified T06–T09. Owner reaffirmed no routine browser/visual tests. T10–T18 local implementation and HTTP journey are present; full phase acceptance remains open for contact-verification delivery and declared external gates.

## Current patient-phase checkpoint

- Resumed the same rebuild branch and preserved every interrupted change. Reopened the saved local provider/database without resetting data. No hosted database or original application changes.
- Full regression: 50/50 tests across14 files passed, including all prior foundations. Typecheck/lint/build passed. Real HTTP synthetic signup/setup/login, AI chat/extraction, private documents, timeline/health, care/control/export and logout denial passed. Final extended correction/assessment HTTP check is recorded in the evidence file.
- T18 care services/screens implemented, with concurrent overlap protection, explicit provider acceptance, durable authorized messaging and patient request/result projections. No browser/visual testing performed.
- [Patient phase evidence](docs/tasks/patient-phase-evidence.md) is the current owner/API/limitations record. Contact verification delivery is not configured and remains an open T10/T18 gate; care producer screens remain assigned to later tasks. Do not claim full patient-phase or production acceptance.
- Changes remain uncommitted in C:/Users/maseglo.com/.codex/worktrees/mhistree-rebuild/mhistree, branch codex/rebuild. Local preview3101, Keycloak8181. Nothing pushed or deployed.

## Patient phase implementation history

- Rechecked all 25 foundation tests: passed before edits. T10 adds real self-registration/setup/login/logout transport, patient-route guards, optimistic profile editing and optional unverified contacts. Four additional real-provider/database tests passed. HTTP app-level acceptance still pending; email delivery/verification is not claimed available.
- T11 adds durable paginated conversations, idempotent send, separate AI replies, failure/retry/cancellation leases and patient-only RLS. Four integration tests passed, including a real configured Gemini reply. Initial provider503 recovered on the next integrated test. No mock is presented as provider proof.
- Owner explicitly selected reuse of the existing AI gateway. Only AI configuration was copied privately from the original environment into ignored .local/ai-config.json. No legacy database credentials were copied. Configured provider Gemini and model gemini-3.1-flash-lite are retained.
- A synthetic local application database is initialized by scripts/prepare-local.mts. Its private connection metadata and provider environment remain ignored in .local and .env.local. It does not contact hosted Supabase or modify the preserved application.
- Recovered interruption checkpoint: T12 extraction real-model/replay and temporal checks passed; T13 private document parsing/original recovery checks passed including actual PDF; T14 snapshot pagination/source isolation passed; T15 correction concurrency/current-state tests passed; T16 real grounded assessment plus invalid-citation rejection passed; T17 consent/narrow/revoke/reconnect/export/closure tests passed. These were targeted checks, not completed HTTP phase acceptance.
- T18 migration existed at interruption; appointments/messaging services and patient care screens were not yet present. Resume adds these on the same access foundation, then checks the full patient journey. The 2026-10-11 regression run passed39/47;8 auth-related failures traced to stopped Keycloak (ECONNREFUSED8181), now being restarted. Typecheck passed. No production or hosted database was touched.
- Original historical checkpoints below remain historical and are superseded by this active scope.

## Historical T06–T09 checkpoint

- Original application was preserved from owner-saved commit `645c9e2` on `codex/preservation-planning`. Only durable handoff/preference notes are updated in that checkout; its application source remains unchanged.
- Active rebuild: `C:/Users/maseglo.com/.codex/worktrees/mhistree-rebuild/mhistree`, branch `codex/rebuild`, created from that commit.
- Old application source/configuration is retained under `legacy/`, excluded from the active build. All160 archived files match their original Git blob hashes. This is the planned migration boundary, not an active second app/schema.
- Rebuild changes are on `codex/rebuild`, uncommitted for review. Real package scripts: dev, build, start, lint, typecheck, test, test:integration, check:client. Node24.14.0/pnpm10.33.2; pinned versions and one active lockfile in package.json.
- Owner confirmed no contactless development instance should be assumed; rebuild authentication afresh, reusing only suitable old code. Email/password availability does not relax contactless requirements.
- No legacy environment values copied. The connected Supabase project belongs to Reslz and must not be used. New migrations were applied only to isolated native PostgreSQL18.4 clusters; authentication used real Keycloak26.8 at127.0.0.1:8181. Development provider settings are not production configuration.
- Latest owner preference: avoid routine browser automation/visual retesting; use established visual references and code/integration checks. Visual testing only for essential questions. Saved in AGENTS; no further browser work after that direction.
- Final checks: frozen install, typecheck, lint,25 tests across5 files, production build and client-bundle scan all passed. Build included an AUTH_CLIENT_SECRET canary; it and server identifiers are absent from static client JS. Four UI/environment tests, four identity tests, six real-provider auth tests, eleven access/record integration tests.
- Evidence and errors repaired: [shared foundations](docs/tasks/shared-foundations-evidence.md). Actual owner/API map: [feature map](docs/feature-map.md). Read feature READMEs before editing.
- Next authorized scope is exhausted. T10 patient entry is the next task, awaiting owner instruction. Read PDF page18, auth/identity READMEs, auth/identity-access contracts, UI guide and T10 packet. Add real UI/transports around these services; do not replace them with legacy email-only logic.
- Earlier planning-time statements below describe their historical checkpoint; the active checkpoint above supersedes their branch/uncommitted/future-worktree descriptions.

## Historical T01–T05 roots, preservation and source

- Existing app/repository: C:/Users/maseglo.com/Documents/FS-projects/Mhistree/mhistree.
- Current branch: codex/preservation-planning. Baseline/master commit: 2c8c46c43e7c74ff71588f6d8fd6b3a0cf9bd64b. Initial status was clean. Current changes are documentation/design artifacts, uncommitted; no app, dependency, or migration source was modified.
- Selected future new-app location: independently running managed worktree on codex/rebuild, exact path to be recorded when T06 creates it from a saved planning revision. No new app/worktree currently exists.
- PDF: Mhistree_AI_Agent_Rebuild_Playbook.pdf, 49 pages, edition2026-10-08; SHA256 4FB82A3DB86AEA4DC07E8D3B96C354FF847E4A34C6F0CD99C664F3FB14833C6A. [Complete retained text](docs/reference/Mhistree_AI_Agent_Rebuild_Playbook.full-text.md).
- T01 was completed before this round. After read-only source and initial UI inspection, WORKFLOW was created before supporting artifacts. The interrupted session had only preliminary WORKFLOW and four design references; resumed work recovered those results and completed the supporting documents.
- No remote schema mutation, data migration, real-patient record query, credentials entered, signup, AI generation or deployment. Existing .env values were neither printed nor copied.

## Historical T01–T05 baseline and checks

Installed: Node24.14.0, pnpm10.33.2, Next16.3.1, React19.2.8, TypeScript5.9.3, Tailwind4.3.3, SupabaseJS2.112.4, SSR0.12.5, AI SDK7.0.78. One pnpm lockfile; many package version ranges. Actual scripts: dev/build/start/lint.

| Check | Actual result |
| --- | --- |
| Initial git inventory | Clean master at baseline above; old source retained. |
| pnpm build | Exit0; routes compiled. Warnings: deprecated middleware convention; missing pdf-parse/tesseract.js. |
| pnpm exec tsc --noEmit --incremental false | No diagnostics initially; rerun after resuming exited0. |
| pnpm lint / compact ESLint inventory | Exit1, 13 errors/7 warnings in two prototype pages and clinician patients-view. Exact paths/lines in audit. Not repaired in planning scope. |
| Existing tests | No application test/spec suite or test script found. No invented test result. |
| pnpm start --hostname 127.0.0.1 --port 3100 | Local production preview rendered guest chat/auth and clinician auth modal. |
| python docs/design/serve-specimen.py | Independent visual-only auth/button specimen served locally3102; no backend/auth calls. |
| T03 visual comparison | Desktop1440×1000 and mobile390×844 card/button geometry matches; empty/error/focus states inspected; additional chat laptop/ultra-wide captures retained. |
| git diff --check and documentation consistency | Passed;14 Markdown files, zero broken local links,36 unique ledger rows,31 ordered future packets,13 assets hashed; PDF hash and mobile reconstruction geometry match; specimen Python parses. |

## Ordered acceptance ledger

Verified T01–T05 rows mean preservation/planning outputs. T06–T09 are local shell/core-service gates, **not** release-ready clinical screens. Detailed records: [preservation evidence](docs/tasks/preservation-evidence.md), [shared foundations](docs/tasks/shared-foundations-evidence.md). Future T10–T36 targets/dependencies/checks: [bounded packets](docs/tasks/rebuild-packets.md).

| Task | Goal | Status | Evidence / next action |
| --- | --- | --- | --- |
| T01 | Product brain | verified | Prior owner-authorized refactor retained; measured annex added without changing canon. |
| T02 | Read-only audit and memory | verified | [Audit](docs/audit/current-state.md), [feature map](docs/feature-map.md); real/partial/mock/absent/unverified separated; no removals/mutations. |
| T03 | Preserve UI system | verified | [Guide](docs/design/UI_GUIDE.md), [catalog](docs/design/component-catalog.md), references and independent auth/button reproduction. Authenticated/dark/broader accessibility coverage explicitly unverified. |
| T04 | Independent architecture/contracts | verified | [Architecture](docs/architecture.md), v1 contracts, [stack](docs/decisions/stack.md); acyclic traces and documented feasible contactless candidate/test plan. No live-provider proof claimed. |
| T05 | Rebuild/verification plan | verified | [Migration](docs/migration-plan.md), [testing](docs/testing.md), 31 bounded packets; isolated planning branch, preserved baseline, future worktree strategy. |
| T06 | Clean foundation | verified | Fresh/frozen install, type/lint, 4 tests, build, client scan and responsive/focus checks passed; shared-foundations-evidence.md. |
| T07 | People and identifiers | verified | Four real PostgreSQL18.4 tests passed: no-contact identity/care reference, non-linking, minimal lookup/denial, rate limit and immutable origins/audit. |
| T08 | Contactless auth core | verified | Real Keycloak26.8/PostgreSQL tests: no-contact setup/login, atomic redemption, replay/expiry/replacement, recovery retirement, password change, logout, staff/role denial and rate limiting. Hosted production configuration is not certified. |
| T09 | Access audit and atomic kernel | verified | Eleven real PostgreSQL tests cover current contexts/RLS, isolation, rollback/replay, correction conflicts, initial care, private file recheck, consent exclusions and revoked author denial. |
| T10 | Patient account entry | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T11 | Durable patient chat | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T12 | Temporal report extraction | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T13 | Private originals and extraction | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T14 | Source-linked timeline | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T15 | Persistent state and corrections | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T16 | Grounded retrieval and assessment | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T17 | Patient access and account controls | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T18 | Patient phase and care surfaces | locally implemented; acceptance limits open | See [patient evidence](docs/tasks/patient-phase-evidence.md); real service and HTTP checks, external delivery/producer gates explicitly retained. |
| T19 | Practitioner profile verification | not-started | Bounded packet T19; PDF page 27; prerequisites/gate not yet run. |
| T20 | Direct connections and registration | not-started | Bounded packet T20; PDF page 28; prerequisites/gate not yet run. |
| T21 | Practitioner records and private work | not-started | Bounded packet T21; PDF page 29; prerequisites/gate not yet run. |
| T22 | Finalize and correct clinical care | not-started | Bounded packet T22; PDF page 30; prerequisites/gate not yet run. |
| T23 | Narrow service requests/results | not-started | Bounded packet T23; PDF page 31; prerequisites/gate not yet run. |
| T24 | Practitioner AI with human review | not-started | Bounded packet T24; PDF page 32; prerequisites/gate not yet run. |
| T25 | Direct-care daily work and gate | not-started | Bounded packet T25; PDF page 33; prerequisites/gate not yet run. |
| T26 | Organization registration/approval | not-started | Bounded packet T26; PDF page 34; prerequisites/gate not yet run. |
| T27 | Membership assignments and context | not-started | Bounded packet T27; PDF page 35; prerequisites/gate not yet run. |
| T28 | Organization care producers | not-started | Bounded packet T28; PDF page 36; prerequisites/gate not yet run. |
| T29 | Assisted activation and recovery UI | not-started | Bounded packet T29; PDF page 37; prerequisites/gate not yet run. |
| T30 | Duplicate review | not-started | Bounded packet T30; PDF page 38; prerequisites/gate not yet run. |
| T31 | Non-expanding merge/reversal | not-started | Bounded packet T31; PDF page 39; prerequisites/gate not yet run. |
| T32 | Cross-context and revocation integration | not-started | Bounded packet T32; PDF page 40; prerequisites/gate not yet run. |
| T33 | Operations and required reviews | not-started | Bounded packet T33; PDF page 41; prerequisites/gate not yet run. |
| T34 | Migration rehearsal | not-started | Bounded packet T34; PDF page 42; prerequisites/gate not yet run. |
| T35 | Integrated release acceptance | not-started | Bounded packet T35; PDF page 43; prerequisites/gate not yet run. |
| T36 | Portable handover | not-started | Bounded packet T36; PDF page 44; prerequisites/gate not yet run. |

## Architecture and bounded read index

- [Feature ownership](docs/feature-map.md): actual legacy paths versus planned owners/APIs.
- [Identity/access v1](docs/contracts/identity-access.md): person/account separation, explicit contexts, initial-care basis, consent origins, sessions, merge/reversal.
- [Clinical records v1](docs/contracts/clinical-records.md): source/time/version, atomic events/state, idempotency, durable jobs, care transitions.
- [Architecture](docs/architecture.md): patient-chat-to-event and organization-read traces; import and server/client boundaries.
- [UI guide](docs/design/UI_GUIDE.md), [component catalog](docs/design/component-catalog.md), [asset manifest](docs/design/asset-manifest.json).
- [Migration plan](docs/migration-plan.md): separate source/data/auth/cutover, backups/reconciliation/rollback and v1 future-hook register.
- [Testing](docs/testing.md): two patients/two practitioners/two orgs plus duplicate/partial/revocation fixtures; T18/T25/T35 phase gates.

## Findings and future blockers

Source audit found caller-controlled authority in privileged timeline/profile/document/verification paths; email-bound person schema; destructive legacy user cleanup; duplicate002 migration prefixes; nontransactional event/state extraction; local-only sharing/corrections/notes and mock documents; heuristic medication trust is not clinical appropriateness. Exact evidence/reuse owners in audit. Do not execute legacy cleanup against retained data or expose legacy APIs as safe rebuild services.

Authenticated clinical screens/backend behavior remain unverified because no safe synthetic authenticated environment was established. Provider UI source is preserved, not bypassed. Dark mode, complete keyboard/contrast/reduced-motion/Safari/throttling/safe-area/zoom coverage remains future verification. Original font/logo source/license needs are declared; the specimen uses a build-generated font and raw repo logo, not a redistributed font bundle.

The original Clerk candidate was superseded by the tested Keycloak adapter after the owner confirmed no development instance should be assumed. [Stack decision](docs/decisions/stack.md), [auth contract](docs/contracts/auth.md). Real no-contact activation/login and recovery passed. Hosted provider/database configuration, production hardening, old email-account migration and verified-contact UI remain later gates. Existing .env is not evidence of a disposable environment.

The rebuild now has50 passing tests. Start the isolated provider with `pwsh -File scripts/start-auth.ps1` (Java25 required) before `pnpm test`; native PostgreSQL test clusters start/stop automatically. Tests use synthetic staff grants and real provider-created synthetic patients. Launch review owners for clinical AI/escalation, identity procedures, data handling/retention and patient explanations remain unassigned. T33/T35 must record human outcomes; no agent approval substituted.

Deferred scope remains AGENTS section2.3; nothing newly deferred to claim success. Previously delivered copies cannot be recalled; no claim of remote deletion.

## Future hooks and next safe action

Versioned hooks, producers, consumers, fields/events, errors, fixtures and readiness are in migration-plan's future-hook register. Key sequence: T07/T08→T10/T20/T28/T29; T09 policy/origins→all consumers/T27/T31/T32; T11–13 sources→T14–16; T17→T20/T27; T18 shared care services→T23/T25/T35. Fixtures do not prove future producer screens.

Current authorized T10–T18 implementation is recorded above; resolve its remaining acceptance limits before declaring the phase complete. Keep working in the attached rebuild root above, not the preserved original application. Existing source APIs are server-only and expose no unfinished HTTP clinical mutation endpoint. T10 must add secure cookie/CSRF/request-key/error transports; T13 production private storage/jobs; T17 consent producers; T19/T26 qualification/org producers. Their fixtures do not claim those screens are built.

## Handoff

2026-10-10: T06–T09 implemented and verified locally. Shell preview uses3101; synthetic Keycloak uses8181; no live schema/data/auth migration or deployment. Database test artifacts and provider secrets remain ignored under .local. Final tests25/25; fresh migrations, build/type/lint/client scan passed;160 legacy files hash-identical. Owner's reduced-browser preference persisted. See task evidence for provider tradeoffs, Windows pg_ctl fix, real fault/race tests and remaining deployment/UI gates.

2026-10-09: recovered pre-interruption audit and completed T02–T05 documentation/reference work; updated AGENTS measured annex. No application/source schema behavior was changed; defects were documented, not silently fixed. Detailed record/checks: docs/tasks/preservation-evidence.md. Temporary specimen server3102 stopped; original local preview3100 remains running. Source and data recovery paths remain separate; no deployment or live migration is implied by planning completion.


2026-10-11 final local checks: full suite50/50; follow-up care/controls/assessment7/7 after final changes; extended real HTTP correction, source detail, assessment and complete export passed. Lint/typecheck/production build/client scan passed. No visual tests. Owner selected Resend for main email and Supabase Auth email verification; integration remains pending intended Mhistree project/delivery configuration and existing-account binding, with no use of Reslz. See patient-phase-evidence.md. Changes remain uncommitted and no deployment occurred.

Preservation recheck 2026-10-11: all160 legacy files match the owner-saved Git blobs after normal Windows CRLF checkout normalization (157 text files); no legacy source changed. Final git diff --check passed; ignored AI/auth/database configuration remains excluded from Git.
