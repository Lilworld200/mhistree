# Mhistree execution memory

## Active rebuild handoff — 2026-10-10

T06–T09 were implemented and verified in the attached independent worktree, **not this preserved original app checkout**. Continue at `C:/Users/maseglo.com/.codex/worktrees/mhistree-rebuild/mhistree`, branch `codex/rebuild`, based on saved planning commit `645c9e2`. Read that worktree's AGENTS.md and WORKFLOW.md plus `docs/tasks/shared-foundations-evidence.md` for actual files, APIs, decisions and remaining gates. All160 archived legacy files match their original Git hashes.

Final rebuild checks: frozen install, typecheck, lint,25 tests across5 files, production build and client-secret scan passed. Tests used isolated real native PostgreSQL18.4 and Keycloak26.8 contactless authentication; no Reslz project, real patient data, legacy credentials, production migration or deployment. Application source in this original checkout is unchanged. Rebuild source is uncommitted for review.

Owner direction: authentication may start afresh; email/password availability does not remove contactless requirements. Avoid routine browser automation/visual retesting; rely on saved references and code/integration checks except when essential. This preference is also saved in AGENTS.

Next task is T10 when the owner authorizes it. The historical T01–T05 checkpoint below is retained for preservation evidence; its future-worktree/not-started statements do not supersede this active handoff.

Revision: 2026-10-09 (Africa/Lagos). Scope: T01–T05 preservation and planning. These planning gates are verified within the evidence boundaries below. **T06 has not started.** Future implementation requires the next owner instruction; no production work was performed.

## Roots, preservation and source

- Existing app/repository: C:/Users/maseglo.com/Documents/FS-projects/Mhistree/mhistree.
- Current branch: codex/preservation-planning. Baseline/master commit: 2c8c46c43e7c74ff71588f6d8fd6b3a0cf9bd64b. Initial status was clean. Current changes are documentation/design artifacts, uncommitted; no app, dependency, or migration source was modified.
- Selected future new-app location: independently running managed worktree on codex/rebuild, exact path to be recorded when T06 creates it from a saved planning revision. No new app/worktree currently exists.
- PDF: Mhistree_AI_Agent_Rebuild_Playbook.pdf, 49 pages, edition2026-10-08; SHA256 4FB82A3DB86AEA4DC07E8D3B96C354FF847E4A34C6F0CD99C664F3FB14833C6A. [Complete retained text](docs/reference/Mhistree_AI_Agent_Rebuild_Playbook.full-text.md).
- T01 was completed before this round. After read-only source and initial UI inspection, WORKFLOW was created before supporting artifacts. The interrupted session had only preliminary WORKFLOW and four design references; resumed work recovered those results and completed the supporting documents.
- No remote schema mutation, data migration, real-patient record query, credentials entered, signup, AI generation or deployment. Existing .env values were neither printed nor copied.

## Baseline and actual checks

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

Verified T01–T05 rows mean preservation/planning outputs, **not** verified clinical app behavior. Detailed inputs/steps/outputs/errors/handoffs for these tasks: [preservation evidence](docs/tasks/preservation-evidence.md). All T06–T36 exact read/change targets, dependencies, checks and future consumers: [bounded packets](docs/tasks/rebuild-packets.md). All future rows are not-started.

| Task | Goal | Status | Evidence / next action |
| --- | --- | --- | --- |
| T01 | Product brain | verified | Prior owner-authorized refactor retained; measured annex added without changing canon. |
| T02 | Read-only audit and memory | verified | [Audit](docs/audit/current-state.md), [feature map](docs/feature-map.md); real/partial/mock/absent/unverified separated; no removals/mutations. |
| T03 | Preserve UI system | verified | [Guide](docs/design/UI_GUIDE.md), [catalog](docs/design/component-catalog.md), references and independent auth/button reproduction. Authenticated/dark/broader accessibility coverage explicitly unverified. |
| T04 | Independent architecture/contracts | verified | [Architecture](docs/architecture.md), v1 contracts, [stack](docs/decisions/stack.md); acyclic traces and documented feasible contactless candidate/test plan. No live-provider proof claimed. |
| T05 | Rebuild/verification plan | verified | [Migration](docs/migration-plan.md), [testing](docs/testing.md), 31 bounded packets; isolated planning branch, preserved baseline, future worktree strategy. |
| T06 | Clean foundation | not-started | Bounded packet T06; PDF page 14; prerequisites/gate not yet run. |
| T07 | People and identifiers | not-started | Bounded packet T07; PDF page 15; prerequisites/gate not yet run. |
| T08 | Contactless auth core | not-started | Bounded packet T08; PDF page 16; prerequisites/gate not yet run. |
| T09 | Access audit and atomic kernel | not-started | Bounded packet T09; PDF page 17; prerequisites/gate not yet run. |
| T10 | Patient account entry | not-started | Bounded packet T10; PDF page 18; prerequisites/gate not yet run. |
| T11 | Durable patient chat | not-started | Bounded packet T11; PDF page 19; prerequisites/gate not yet run. |
| T12 | Temporal report extraction | not-started | Bounded packet T12; PDF page 20; prerequisites/gate not yet run. |
| T13 | Private originals and extraction | not-started | Bounded packet T13; PDF page 21; prerequisites/gate not yet run. |
| T14 | Source-linked timeline | not-started | Bounded packet T14; PDF page 22; prerequisites/gate not yet run. |
| T15 | Persistent state and corrections | not-started | Bounded packet T15; PDF page 23; prerequisites/gate not yet run. |
| T16 | Grounded retrieval and assessment | not-started | Bounded packet T16; PDF page 24; prerequisites/gate not yet run. |
| T17 | Patient access and account controls | not-started | Bounded packet T17; PDF page 25; prerequisites/gate not yet run. |
| T18 | Patient phase and care surfaces | not-started | Bounded packet T18; PDF page 26; prerequisites/gate not yet run. |
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

Contactless candidate: supported Clerk username/password adapter with Supabase third-party integration. Documentary feasibility only; real T08 spike requires isolated provider configuration and must prove activation/login/recovery/session retirement before dependent auth completion. No service purchase/account/configuration was made. Existing .env is not evidence of a disposable environment.

No tests exist yet; T06 must establish actual scripts/runners. Launch review owners for clinical AI/escalation, identity procedures, data handling/retention and patient explanations remain unassigned. T33/T35 must record human outcomes; no agent approval substituted.

Deferred scope remains AGENTS section2.3; nothing newly deferred to claim success. Previously delivered copies cannot be recalled; no claim of remote deletion.

## Future hooks and next safe action

Versioned hooks, producers, consumers, fields/events, errors, fixtures and readiness are in migration-plan's future-hook register. Key sequence: T07/T08→T10/T20/T28/T29; T09 policy/origins→all consumers/T27/T31/T32; T11–13 sources→T14–16; T17→T20/T27; T18 shared care services→T23/T25/T35. Fixtures do not prove future producer screens.

Next authorized build task is T06. Minimum packet: AGENTS, this file, full PDF page14 and AppendicesA–D, architecture, feature map, UI guide/catalog, migration/testing plans, T06 bounded packet, baseline failures. Preserve planning changes in a reviewed revision before creating the future worktree. Inspect current user changes first. Establish actual new-app root/environment and scripts, then implement only the authorized slice.

## Handoff

2026-10-09: recovered pre-interruption audit and completed T02–T05 documentation/reference work; updated AGENTS measured annex. No application/source schema behavior was changed; defects were documented, not silently fixed. Detailed record/checks: docs/tasks/preservation-evidence.md. Temporary specimen server3102 stopped; original local preview3100 remains running. Source and data recovery paths remain separate; no deployment or live migration is implied by planning completion.

2026-10-11 patient-phase handoff: implementation is in C:/Users/maseglo.com/.codex/worktrees/mhistree-rebuild/mhistree on codex/rebuild, still uncommitted. Read that worktree's WORKFLOW.md and docs/tasks/patient-phase-evidence.md for current T10–T18 state. Full50 tests, targeted7, real HTTP patient journey, lint/type/build/client scan passed; no browser tests. Original application remains preserved. Owner selected Resend main email and Supabase Auth email verification; intended Mhistree project/delivery configuration and verification integration remain open. Never use the unrelated Reslz project.
