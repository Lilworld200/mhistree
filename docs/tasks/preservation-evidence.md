# T01–T05 preservation/planning handoff evidence

Date2026-10-09; baseline commit2c8c46c43e7c74ff71588f6d8fd6b3a0cf9bd64b. Planning branch codex/preservation-planning; changes uncommitted. No application, database or auth behavior changed. Design-only HTML/server is a supporting verification artifact, not T06 implementation.

## T01 retained product brain

Status verified from previous owner-authorized refactor. Read AGENTS and complete task/canon/appendices again for this scope. Added measured portable design annex only; product canon unchanged. Input: PDF edition2026-10-08. Output: AGENTS remains durable specification and indexes design assets. Prior gate: existing file present; PDF source hash recorded. Downstream: every task. Next: retrieve it with WORKFLOW before T06.

## T02 audit and second governing file

Status verified. Read git/package/config/routes/schema/auth/AI/UI/test inventory; traced chat, extraction, timeline/state, document, sharing and provider operations. Initial git clean; no reset/stash/removal. Read-only initial UI/source inspection preceded WORKFLOW; supporting artifacts followed. Output: docs/audit/current-state.md and docs/feature-map.md, with existing versus planned paths and evidence-backed keep/adapt/replace/defer decisions. No tests found; real integration source is not labeled end-to-end verified.

Actual baseline commands: pnpm build exit0; pnpm lint exit1 with13 errors7 warnings; pnpm exec tsc --noEmit --incremental false without diagnostics and resumed rerun exit0. Compact ESLint API inventory located failures in two prototype pages and clinician patients effect. Missing parser modules and middleware warning retained. Local server command pnpm start --hostname127.0.0.1 --port3100 (actual shell invocation used spaces between flags/values). No clinically meaningful request was submitted. Failures map to future owning tasks in audit. Downstream T03/T04; gate does not require fixing the app during read-only audit.

## T03 UI preservation

Status verified for representative page/component gate, with explicit uncovered states. Read global CSS, shell, buttons/overlays/avatar/badges/rows/charts, representative patient/provider source; rendered guest chat/auth/mobile nav and provider sign-in restriction. Captured light desktop/mobile/laptop/ultra-wide chat, nav focus, auth empty/required field. No real patient content or credentials.

Created independent docs/design/auth-specimen.html and whitelisted serve-specimen.py; original logo and existing build-generated Manrope font only. It has no auth/backend integration. Compared desktop1440×1000 and mobile390×844. Card/button rectangles match to captured precision; mobile no horizontal overflow; empty submission triggers native validation and first-field focus in both. Screenshots show same spacing/type/gradient hierarchy; raw logo sharper than optimized reference. Original/specimen mobile geometry JSON retained. This proves a representative page/component can be rebuilt from the captured styles/assets; not full product functionality or pixel identity.

Mobile menu open focuses Close; Escape closes after transition, but trigger focus return unverified/needs repair. Known mobile14px input, close-target and reduced-motion issues documented. Authenticated provider dense states need a synthetic session; dark/contrast/Safari/performance/safe-area/zoom coverage unresolved. Source/assets preserved and missing licensing evidence declared. Outputs: UI_GUIDE, catalog, manifest, sanitized references, specimen, AGENTS annex. Future consumer: every UI task. Next: T06 compares actual rebuilt shell and repairs accessibility with visual rationale.

## T04 architecture and contracts

Status verified documentary gate. Read canon, audit/design, current official framework/auth docs and Supabase skill guidance. Ownership designed from product first; reuse map applied afterward. Output: architecture.md, contracts/identity-access.md, contracts/clinical-records.md, decisions/stack.md. Traces: patient chat→durable source→validated extraction→atomic event/state; organization staff→current explicit context→scoped record query/delivery. Access reads policy projections without importing producer orchestrators; record kernel does not import chat/document UI, avoiding cycles.

Supabase direct password flow is contact-bound; documented Clerk username/password plus supported third-party adapter is a feasible candidate with explicit T08 sandbox test plan. No live compatibility/credential setup claimed. Failure paths cover stale JWT, provider/local transaction gap, recovery, replay and non-expanding merge. Future consumers T06–36. Next: T08 must prove actual no-contact integration before dependent implementation completes.

## T05 bounded plan

Status verified planning gate. Inputs: contracts, audit failures, reuse map and ledger. Outputs: migration-plan.md, testing.md, tasks/rebuild-packets.md, final WORKFLOW/map. Isolated planning branch created; old master commit and checkout retained. Future independently running managed rebuild worktree selected; no T06 checkout/source created. All31 future task packets identify owner, exact target/read paths, dependencies, steps, positive/negative gate, errors, outputs and consumers. Target paths/migration timestamp placeholders are explicitly not existing files.

Fixtures specify two people, two practitioners, two organizations, provisional duplicate, independent direct/org grants, partial extraction, private/draft/final visibility, time ambiguity, races and recovery. Four migration boundaries and backup/reconciliation/rollback/cutover authorization are distinct. Named human release reviews remain future blockers. No undocumented stub is counted as working.

## Final verification and limitations

Documentation consistency check executed successfully:14 Markdown files checked, zero missing local links,36 unique ledger rows,31 ordered future packets,13 image/logo assets hashed with dimensions, PDF SHA256 matches, specimen Python syntax valid, original/reconstruction mobile geometry objects identical. git diff --check passed; tracked source diff contains only AGENTS and untracked additions are documentation/design artifacts. No repeat build was necessary after documentation-only changes; resumed TypeScript rerun exited0. Legacy lint remains failing and is not masked by docs checks.

No commit, push, PR, schema migration or deployment. Temporary specimen service on3102 was stopped after capture. The original local preview on3100 remains running for inspection. Next task T06 uses AGENTS/WORKFLOW, PDF page14/appendices, architecture, migration/testing, feature map and UI guide/catalog. Retain all these files for future context retrieval.
