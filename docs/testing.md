# Verification plan and evidence boundaries — T05

2026-10-09. [WORKFLOW](../WORKFLOW.md) is the acceptance ledger. [Audit](audit/current-state.md) records actual baseline results; all future tests below are planned, not passing checks. Read [task packets](tasks/rebuild-packets.md) for owners/files and the complete PDF page before each task.

## Commands: actual versus proposed

Existing actual scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`. Baseline `pnpm build` exit0; type check `pnpm exec tsc --noEmit --incremental false` no diagnostics; lint exit1 (13 errors/7 warnings). Local preview command: `pnpm start --hostname 127.0.0.1 --port 3100`. No test script or test suite exists in current app. Missing pdf-parse/tesseract.js and deprecated middleware warnings are unresolved legacy findings.

T06 must establish actual typecheck, unit/integration and browser test runners/scripts in the new application, then record exact invocations and prerequisites. Recommended separate suites: domain unit tests, real disposable Postgres/RLS/storage contract tests, real provider sandbox auth/AI checks, synthetic browser journeys, and prompt evaluation fixtures. Do not print `pnpm test` as a passing command before creating/running it. Package selection/pinning is T06 work, not performed here.

Each task evidence record: environment/version/commit; prerequisite command and observed result; exact fixture; actual command/manual steps; expected/observed positive and negative result; source/test paths; screenshot/log artifact without secrets; blocked dependencies; next owner. A mock unit test can prove error handling, never real provider compatibility or a finished care journey.

## Synthetic fixture manifest (to implement in T07–09)

| ID | Required setup |
| --- | --- |
| P-A | Synthetic person, no contacts/account initially; synthetic ORG-A-origin care; later patient activation preserves person ID/history. |
| P-B | Distinct activated synthetic patient; cannot access P-A by guessed source/session/file IDs. |
| P-A2 | Provisional duplicate of P-A created at ORG-B; disjoint origins/grants; neither/one/both activated survivor variants and tied/missing login evidence. |
| PR-A | Verified practitioner, direct P-A connection plus ORG-A membership/assignment; revoke org while direct stays valid only when explicitly chosen. |
| PR-B | Second practitioner, qualification variants pending/approved/suspended; independent scoped request recipient; no PR-A private-note access. |
| ORG-A / ORG-B | Two independent organizations; pending/approved/suspended variants; separate admins without automatic clinical privilege; assignments limited to categories. |
| DOC-PARTIAL | Generated synthetic multi-page report, known checksum; readable fact, ambiguous unit/date, wrong-person variant, embedded hostile instruction treated as text. |
| REPORT-TIME | Running yesterday then leg pain; other-leg ambiguity; unknown medicine; general/hypothetical/third-party variants; midnight and Africa/Lagos plus another zone; month precision. |
| PRIVATE-A / DRAFT-A / FINAL-A | Distinct visibility sentinels, author/team/finalized states; verify absence of private sentinel from patient and unrelated AI/output/export. |
| JOB-RETRY / SLOT-RACE / MERGE-LATE | Fail after claim/write/provider call, concurrent same slot, post-merge contribution/correction/consent requiring reversal mapping. |

All names, records, passwords/tokens and files are synthetic in a designated non-production environment. Generate ephemeral credentials outside committed fixtures. Seed permissions only through isolated test setup; ordinary production users cannot call seed or self-verification routes. Never point a destructive seed/reset at an unclassified .env backend.

## Measurable gates

- Identity/auth: no-contact creation/activation/recovery; one token redemption winner; old sessions rejected even before JWT expiry; no staff password choice; optional contact verification independent.
- Access: enumerate every read/write/download/AI/job/appointment/message/finalization/result consumer. For each test allowed context, wrong person/org, narrowed category, revoked grant, missing assignment, unverified role, source origin after merge. No fallback/context union. Check direct API and exposed DB/storage, not just UI.
- Consistency: inject failure between domain steps; event/state/audit/outbox atomic where required. Same idempotency key produces one result; changed payload conflicts. Concurrent corrections/finalizations and merge cannot lose versions.
- Time/source: capture to seconds plus zone; event precision exact/approximate/range/unknown; relative source-time anchor; no invented causation/drug/diagnosis; retained original/source versions and links.
- Documents/jobs: original checksum recoverable through parser/storage/provider outages; partial success visible; retry stable item IDs; wrong patient/ambiguous clinical fields held; worker restart/lease recovery bounded and no duplicate.
- AI: actual authorized sources cited; contradictions/gaps/old age retained; old AI/duplicate reports not independent evidence; no private leakage; malformed model output rejected; no autonomous diagnosis/prescription/finalization; stream loses access safely.
- Care: finalized care visible to patient; private/draft excluded; requests explicit; result correction versus repeat distinct; revoked work paused, fresh consent plus explicit review needed; booking race one accepted slot; messages durable/idempotent.
- Reconciliation: all survivor cases, aliases, disjoint grants, sessions/tokens retired, original checksums/versions retained, concurrent/replay/rollback, reversal after later records and consent.
- Operations/release: restore database and original; logs exclude secrets/raw medical payloads; safe manual retry; actual limits documented; named clinical/identity/retention/explanation outcomes recorded before launch.

## Visual/accessibility gates

Use saved [design references](design/UI_GUIDE.md) at 390×844, 1366×768, 1440×1000 and 2560×1440, then test zoom/safe-area behavior separately. Same fonts/theme/synthetic state; compare shell geometry, type wrapping, density, controls and overflow. Record necessary accessibility differences. Test keyboard traversal/focus trap/return, Escape, native/inline errors, reduced motion, contrast, mobile44 targets and16px inputs, loading/empty/sparse/dense/error/revoked/retry/long-content states. Authenticated provider screenshots need a safe synthetic session; do not bypass guards. Throttled performance and Safari coverage are future evidence, not implied by one desktop build.

T03 independent sign-in page/button reproduction matches measured desktop/mobile geometry and observed empty/focus/validation states; see UI_GUIDE and reconstruction references. T06 must compare the actual new foundation against those references. Authenticated provider, dark mode and broader accessibility/performance coverage remain unverified.

## Phase acceptance

T18: real patient registration→chat→extraction→upload→timeline/state→correction→assessment→consent. Booking/messaging services durable; fixture-backed absent provider producers explicitly labeled.

T25: real direct practitioner connects→books→texts→drafts/finalizes→requests/result→patient reviews. All producer screens actually call shared services.

T35: repeat Appendix D's ten scenarios with patient/direct/organization screens and real required sandbox integrations: no-contact care/activation; natural capture; partial documents; corrections/repeats; direct care; organization permissions; mid-work revocation; merge/reversal; recovery/isolation; operational recovery. Any missing required integration/review blocks readiness. Deployment is a separate authorized action.

Review owners remain **unassigned**, not approved: clinical AI/escalation; identity-verification procedure; data handling/retention; patient-facing explanations. T33 must name humans and record outcomes; agents cannot self-certify these approvals.
