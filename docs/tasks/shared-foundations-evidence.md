# Shared foundations — T06–T09

Date: 2026-10-10. Owner authorized this group and confirmed authentication should start afresh without assuming a contactless development instance. Original checkout remains at `645c9e2`; active branch is `codex/rebuild` in the attached managed worktree. No live project/data was touched.

## T06 — clean foundation

Inputs: full PDF page14, Appendices A–D, AGENTS/WORKFLOW, architecture, design guide/catalog, audit/reuse matrix, migration/testing plans and bounded packet. Preserved old source under `legacy/`, excluded from TypeScript, ESLint and Tailwind source discovery. Reused reviewed tokens, logos, icons and buttons, replacing stores/mock behaviors with explicit unavailable states.

Actual checks: fresh pinned install and frozen-lockfile install passed; typecheck, lint, four unit tests, production build and static client secret-identifier scan passed. Final post-interaction regression rerun recorded in WORKFLOW. Invalid environment errors are sanitized. Error fallback was observed during a real rendering failure; the failure was repaired (Radix Slottable compatibility), and a DOM test verifies sensitive errors are hidden and the Next `retry` refetch callback is invoked. This is Next16.3's `retry`, not reset-only rendering. Framework-generated agent guidance was inspected; automatic appending disabled to preserve the project brain.

Browser evidence: at1440×1000 sidebar (20,20,288,960) and main (328,20,1092,960), matching T03. At390×844 topbar (12,12,366.4,58.8), document scrollWidth390 and input16px. Navigation opens on Close menu, single Escape closes it and returns focus to Open menu. Removed close-button tooltip after observing it consume the first Escape. Captures: `docs/design/reference/foundation/chat-desktop.png` and `chat-mobile.png`. Intentional differences: honest unavailable labels, disabled actions, mobile input16px and44px hit targets. Full authenticated/dark/Safari coverage remains later work.

Future consumer: T07 identity; T10+ replaces placeholders through shared services. No real chat, document, health or clinical action is claimed.

## T07 — people and identifiers, verified

Inputs: full PDF page15, identity/access contract, stack candidate and migration conventions. Added Person, Account link/provider subject, optional independent Contact verification, unique aliases, provisional/canonical/merge-reservation fields and immutable creator/context/origin. Registration/lookup now verify the current session within their transaction; staff capabilities, org membership/approval and direct registration qualification are checked. Lookup returns bounded minimal demographics and review flag, never history. Unknowns remain null; shared names/phones do not auto-link.

Four native PostgreSQL tests pass: no-account/no-contact person plus care FK fixture, separate matching identities, unknown session/guessed-locator denial and limited lookup, rate limiting and immutable audit/origin. Harness initially failed because embedded-postgres spawned an elevated Windows process; fixed using the bundled PostgreSQL pg_ctl restricted-token path and UTF8 initdb. A subsequent pg_ctl inherited-pipe wait was fixed using exit events/ignored stdio. No OS user/security setting was changed. SQL fixture parameter typing was fixed explicitly. T08/T09 consumers reran these checks successfully.

## T08 — authentication core, verified locally

Inputs: full PDF page16, identity/token/session contract and current official provider docs. Owner authorized starting afresh without assuming an existing contactless instance. Keycloak26.8 supplies actual supported username/password credentials; no invented contacts. ZIP from official Keycloak GitHub release; observed SHA256 `7ED1DE3FDA2598369262613BF682AAB7E233D80A38C405E91588F7A7454370A1`. See [auth contract](../contracts/auth.md) and [owner README](../../features/auth/README.md).

Six tests use real HTTP calls to the local provider and real PostgreSQL: contactless activation/login; replacement/expiry/replay and concurrent redemption; setup-only authority; recovery and logout retirement; changed old password denial; ordinary-staff/password-field denial; attempt limits; optional separately verified email; provider outage with immediate local denial/pending reconciliation; provider-success/DB-failure retry preserving one identity/account; tampered/wrong-client/wrong-issuer token rejection. Passwords and code plaintext are absent from application tables/audit. Patient login time is recorded separately from staff action. No webhook is installed, so webhook replay is not an exposed integration and cannot reactivate an account.

Provider limits/tradeoffs: an additional auth service must be hosted/maintained. Local import uses development-only loopback settings and confidential direct grants; this proves the required core path, not production hardening, browser SSO/MFA or SMTP delivery. Production/provider migration and T10/T29 screens remain separate. The unrelated Reslz Supabase project was not used. No paid service/account was created.

## T09 — access/audit/atomic records, verified locally

Inputs: full PDF page17, contribution/access contracts and verified T07/T08 APIs. Added a single current-state SQL policy shared by server authorization and RLS, patient/direct/org/initial-care contexts, immutable consent lineage and original-person/context partitions, organization/membership/assignment/qualification projections. Runtime role cannot read session credentials or alter authority tables; public/anon cannot access the private schema. Original sources/record revisions are immutable and database-checked against origin/state mismatches.

Record acceptance/correction atomically writes event/head/affected state/audit/outbox, with source-version-item and actor/context/body-bound operation idempotency. New-source corrections retain supersession and expected-version conflicts. Private/draft contributions stay outside patient reads/state; patients cannot rewrite professional findings. Revocation pauses dependent work and invalidates publication tickets; fresh eligibility alone does not resume it. Audit is centralized and excludes clinical text/secrets; denial events omit requested patient data.

Eleven real PostgreSQL tests cover two patients/two practitioners/two organizations, tampered selectors, cross-context isolation, assignment ceiling, suspended qualification/admin-only denial, draft/private isolation, professional rewrite denial, injected state failure with full rollback, concurrent replay/correction, direct SQL/anon denial, preserved post-merge-shaped origin boundary, unactivated attributed initial care, a real synthetic private file with pre-read and in-flight revocation checks, organization revocation/publication/paused work/staff removal, consent exclusions and revoked-author read/write denial. Fixture grants are setup-only. No merge implementation or future producer UI is claimed.

## Final combined verification and handoff

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` (25 tests/5 files), `pnpm build`, and `pnpm check:client` passed. Final build had `AUTH_CLIENT_SECRET=MHISTREE_SECRET_CANARY`; static client JS contains neither it nor tested server-secret identifiers. All160 archived source/config files match original Git hashes. No additional browser testing followed the owner's request to reserve it for essential checks. Active source was formatted; legacy source was not rewritten.

T10 is next, awaiting owner instruction. Read the PDF task page, AGENTS/WORKFLOW, identity/auth READMEs and contracts, and the measured visual guide. Source work is uncommitted in the attached codex/rebuild worktree. Hosted deployment grants, TLS/provider hardening, production private storage, future screens and named clinical/identity/retention launch reviews are unverified later gates, not hidden completions.
