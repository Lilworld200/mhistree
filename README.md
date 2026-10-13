# Mhistree rebuild

Read AGENTS.md, WORKFLOW.md and the current playbook task packet before editing. This rebuild can run from the project checkout or the independent `codex/rebuild` worktree. `legacy/` preserves the old application and migrations as reference only; do not execute its cleanup or expose its APIs. Local runtime configuration remains specific to each checkout; merging source does not copy ignored environment or database files.

## Local shell

Use Node 24 and pnpm 10.33.2. Run `pnpm install --frozen-lockfile`, then `pnpm dev` (loopback port 3101). `pnpm build` and `pnpm start` run the production shell. The font build requires access to Google Fonts. No clinical integration is implied by a rendered placeholder.

For integration tests, install Java25 and start `pwsh -File scripts/start-auth.ps1` in a separate terminal. It prepares an isolated Keycloak realm on loopback8181; then run `pnpm test` or `pnpm test:integration`. Native PostgreSQL clusters are created automatically under ignored `.local/` and stopped after tests. Windows uses pg_ctl's supported restricted process; Linux/macOS must run PostgreSQL tests as a non-root user. The provider import creates only synthetic test configuration. Secrets stay in ignored local files. Do not deploy that development configuration.

Checks: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm check:client`. The original checkout's lint failures are isolated under `legacy/`; active source must pass. Copy `.env.example` only when configuring a deliberately selected environment. Never copy legacy secrets or use the unrelated Reslz project.

## Owners

- `components/layout`, `components/ui`, `app/globals.css`: inspected visual foundation, accessible navigation and feedback.
- `lib/env.ts`, `lib/db/client.ts`: server-only configuration and transactional PostgreSQL adapter.
- `features/patient`: honest intermediate shell; later tasks supply real patient capabilities.
- `docs/tasks/shared-foundations-evidence.md`: task gates, test evidence and remaining work.

Source refactoring is not data migration, authentication migration or production cutover. Those require separate rehearsals and authorization.

## Patient phase — current

T10–T18 now compose real patient routes over the shared foundation. Run the isolated provider, `pnpm exec tsx scripts/prepare-local.mts`, then `pnpm dev`. The prepare command resumes the saved local synthetic database and writes ignored server-only environment configuration. Owner-authorized AI settings are reused privately; never copy the old database credentials.

`pnpm exec tsx scripts/verify-patient-http.mts` exercises a real synthetic HTTP journey without browser automation. It retains synthetic accounts/history locally and makes real configured AI calls. See docs/tasks/patient-phase-evidence.md and WORKFLOW.md for current checks and open contact-delivery, production-storage/job and human-review gates. Source composition lives in features/patient, ai-chat, documents, health-records, access, appointments and messaging; their READMEs supersede the earlier shell-only description above.
