# T02 current-state audit

Observed 2026-10-09 on Windows, baseline commit `2c8c46c43e7c74ff71588f6d8fd6b3a0cf9bd64b`. Read with [WORKFLOW](../../WORKFLOW.md). This is a source and local-preview audit, not a penetration test or certification of the deployed database. WORKFLOW was created before these supporting artifacts. No application source, migrations, credentials, or remote records were changed.

## Baseline evidence

Actual application root is the repository root. Root `app/`, `features/`, `components/`, `lib/`, and `supabase/migrations/` exist. Proposed `components/layout/` and `features/auth/` do not yet exist. README is scaffold documentation, not a reliable product specification. Legacy docs and prototype pages are historical evidence only.

Installed versions: Node 24.14.0, pnpm 10.33.2, Next 16.3.1, React 19.2.8, TypeScript 5.9.3, Tailwind 4.3.3, Supabase JS 2.112.4, SSR 0.12.5, AI SDK 7.0.78. One pnpm lockfile exists; many package versions use ranges. Scripts are dev/build/start/lint; no test script or application test suite was found.

| Actual check | Result |
| --- | --- |
| `pnpm exec tsc --noEmit --incremental false` | No diagnostics; production build also passed TypeScript. |
| `pnpm build` | Exit 0, all routes built. Missing optional pdf-parse/tesseract.js warnings; deprecated middleware convention warning. |
| `pnpm lint` | Exit 1: 13 errors, 7 warnings. |
| Local production preview, port 3100 | Guest chat and auth render; clinician workspace presents authentication modal. |
| Clinical integrations | Not exercised with authenticated synthetic accounts; no real-patient reads or writes. |

Precise lint locations: `app/qwenfour/page.jsx` errors at 322, 349 (three), 970, 1348; warnings 156 (two), 302. `app/qwenthree/page.jsx` errors 313, 340 (three), 876, 1254; warnings 155 (two), 293. `features/clinician/components/patients-view.tsx` error 25, warning 20. Rules concern render purity, nested component definitions, state updates in effects, unused variables, and raw images. These failures predate this documentation work.

## Capability and reuse matrix

Status refers to current implementation evidence. “Partial” means source contains real integration, not that the full journey passed. Removal decisions below are future plans; nothing was removed.

| Area and exact source | Status | Decision and owner/task |
| --- | --- | --- |
| `app/layout.tsx`, `app/globals.css`, `features/shell/components/app-shell.tsx`, `components/ui/` | Rendered guest shell works; full state/accessibility coverage incomplete | Adapt visual primitives, T03/T06; preserve measured design, repair documented defects. |
| `app/auth/page.tsx`, `components/auth/auth-guard.tsx`, `middleware.ts`, `lib/supabase/server.ts` | Partial email-bound auth; guard is client-only | Replace domain authorization/activation, adapt provider plumbing only after T08 compatibility gate. Middleware refresh is not authorization. |
| `supabase/migrations/001_main.sql` users/profiles/practitioners | Person/account conflated; users require unique email | Replace target identity schema in isolated migration stream, T07–09/T34. Preserve legacy data. |
| `app/api/profile/route.ts`, `app/api/timeline/route.ts` | Real admin-client reads; unsafe caller-controlled IDs | Replace adapters/services, T09/T14/T15. No authenticated end-to-end verification. |
| `features/chat/store.ts`, `app/api/ai/chat/route.ts`, `app/api/ai/chat/history/route.ts` | Partial streaming/persistence | Adapt interaction; replace session ownership, durable send/extraction and pagination, T11/T12. |
| `lib/ai/gateway.ts`, `lib/ai/config.ts` | Existing multi-purpose provider abstraction | Adapt behind explicit typed errors/configuration, T06/T11/T16; unknown-provider fallback must not mask configuration failure. |
| `lib/ai/rag.ts` | Partial embedding/search | Replace access filtering, provenance/version handling and failure semantics, T13/T16. |
| `features/documents/store.ts`, `features/documents/data/seed.ts` | Mock upload/extraction (timer and seeded data) | Keep card/drawer appearance only; replace service, T13. |
| `app/api/documents/route.ts`, `app/api/documents/ingest/route.ts`, `lib/documents/parser.ts` | Partial backend; original storage/job contract absent | Replace T13; retain original before extraction. |
| `features/timeline/store.ts` | Partial real reads; local-only verification/correction/dispute | Adapt presentation, replace operations T14/T15/T22. |
| `lib/server/profile-sync.ts`, `lib/server/medication-persistence.ts`, `lib/server/trust-score.ts` | Heuristic derived state/nontransactional writes | Replace T09/T12/T15; completeness score cannot establish appropriate medication or clinical authority. |
| `features/health/components/health-view.tsx`, `features/profile/components/profile-view.tsx` | Mixed real projection and presentation assumptions | Adapt visuals T15; replace automatic check-in sending of fabricated first-person health text. |
| `features/sharing/store.ts`, `features/sharing/components/` | Mock timed QR leases | Replace access semantics T09/T17/T20; reuse suitable cards only. Continuing independent consent is not a browser timer. |
| `features/clinician/store.ts`, `features/clinician/components/dashboard-view.tsx` | Local notes, seeded dashboard, partial AI call | Adapt layout T19–25; replace care operations/private-state boundaries. |
| `features/clinician/components/patients-view.tsx` | Empty local array; no patient query | Replace controlled lookup and authorized list T20. |
| `app/api/clinician/verify-memory/route.ts` | Unauthenticated caller-supplied verification authority | Replace with authorized professional finalization T09/T22. |
| `features/settings/store.ts`, `features/settings/components/settings-view.tsx` | Local preferences/export projection | Adapt presentation; implement actual scoped export/review requests T17/T33. |
| `lib/security/audit.ts` | Partial best-effort logging | Replace accountable transaction/outbox audit T09; verify returned DB errors; no unsupported compliance claim. |
| Organization approval/assignments, reconciliation, durable care messages/appointments | No complete implementation found | New owners T18/T26–31; not implied by dashboard cards. |
| `app/qwenthree/page.jsx`, `app/qwenfour/page.jsx` | Legacy prototypes; lint failures | Preserve as reference; exclude from new application routing T06. Do not delete old source. |
| Audio/video, pharmacy, payments, inventory, external calendars | Outside accepted release | Defer per AGENTS; no scaffold pretending functionality. |

## Material defects and evidence boundaries

1. **Authorization:** timeline GET/POST trust supplied patient/role with service-role client. Profile resolves session only when user ID is missing/default. Documents and verification routes similarly accept authority-bearing identifiers without current session/consent checks. No actual record was requested to demonstrate exploitation. All must be denied at route, service, database, and file boundaries in the rebuild.
2. **Verification:** extract-medical authenticates but trusts contributor role for verification. Owner-wide policies on practitioner/memory rows do not separate clinical/reviewer fields. Qualification cannot be inferred from caller role or extracted source wording.
3. **Chat ownership/durability:** client session ID is upserted through admin without prior ownership check; allowed incoming roles include system. Patient send lacks end-to-end idempotency; sessionStorage is not identity-scoped. SSE parsing lacks a carry buffer. Background `after()` extraction is not a durable job. Logged facts/regimens expose unnecessary clinical payloads.
4. **Records:** separate event/state writes and fuzzy text/name dedup can overwrite conflicts or leave partial state. Timeline uses capture time where event time is needed. History is unbounded. Medication confidence is a heuristic, not evidence of what a patient should take.
5. **Documents:** API selects columns absent from shipped schema; ingestion arguments mismatch signature. Original-file storage/checksums/jobs are absent. Missing parser dependencies fall back to binary text/placeholder strings; this must become explicit failure, never apparent clinical extraction.
6. **Migrations:** `002_resilient_signup_trigger.sql` deletes public users absent from auth and conflicting-email identities, with cascades. This violates no-account care/history preservation. Two migration files share prefix 002. Do not run old migrations against retained data. Actual deployed schema/version/data inventory remains unknown.
7. **UI truthfulness:** local sharing revocation and note toasts claim persistence/access results without server enforcement. UI continuity/context text does not prove authorized retrieval. Guard opacity is not data protection.

## Preservation and limits

Source remains recoverable at the recorded commit and in the unchanged checkout. No remote schema/data/auth inventory was performed; presence of local environment variables proves neither test-environment isolation nor backend readiness. No secrets were copied into evidence. Existing integration credentials must not be reused for destructive test fixtures until the environment is identified as disposable non-production.

T02 gate: audit/order/reuse mapping established. T03 consumes [design references](../design/UI_GUIDE.md); T04 consumes defects as constraints, not as the target model. Missing authenticated visual evidence stays explicit.
