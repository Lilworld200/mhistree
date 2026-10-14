# Feature ownership and bounded navigation

2026-10-14 current auth owner: `features/auth/email.ts` and `lib/auth/supabase.ts`, selected by `lib/auth/config.ts`; account entry uses email/password and verification. /auth/confirm and /recovery/update compose `features/patient/account/email-callback.tsx`; /recovery composes `email-recovery-form.tsx`. [Auth contract](contracts/auth.md), [SMTP/callback setup](tasks/supabase-auth-setup.md), `tests/integration/supabase-email.test.ts`. Main project checkout now contains this active source; older rebuild-root/provider descriptions below are historical.

Revision 2026-10-13. Start with AGENTS and WORKFLOW, then the owning README/contracts/direct callers. The active source lives in the codex/rebuild worktree; old entrypoints below now have a `legacy/` prefix there. The following foundation owners are implemented; the older planning table retains historical targets, not claims of completion. Current T19-T31 owners are indexed below; no T32+ implementation is authorized by this phase.

| Implemented owner | Entry/API and evidence |
| --- | --- |
| identity T07 | `features/identity/server.ts`: registerPerson, lookupPeople; current session/capability checks. [README](../features/identity/README.md). |
| auth T08 | `features/auth/server.ts`, sessions.ts; `lib/auth/keycloak.ts`, config.ts; real local provider. [README](../features/auth/README.md), [contract](contracts/auth.md). |
| access T09 | `features/access/server.ts`: withAccess, authorize, revokeConnection, publication rechecks; private-files.ts. SQL policy/RLS is the rule owner. [README](../features/access/README.md). |
| records T09 | `features/health-records/{schema,server}.ts`: recordSource, acceptContribution with correction, readContribution. [README](../features/health-records/README.md). |
| audit T09 | `features/audit/server.ts`: appendEvent; bounded attribution, immutable DB rows. [README](../features/audit/README.md). |
| shell T06 | `components/layout/app-shell.tsx`, shared buttons/icons/page-state, app feedback routes and patient placeholder. [Evidence](tasks/shared-foundations-evidence.md). |

Migrations: `supabase/migrations/20261010103648_identity_foundation.sql`, `20261010104053_auth_foundation.sql`, `20261010105034_access_record_kernel.sql`. All are new private-schema migrations, applied only to fresh synthetic native clusters. Tests live in `tests/integration/`; local provider startup in `scripts/start-auth.ps1`. No legacy migration is executed.

| Target owner / tasks | Existing entrypoints to inspect | Planned public server operations / files |
| --- | --- | --- |
| identity / T07,T30,T31 | `supabase/migrations/001_main.sql`, `002_resilient_signup_trigger.sql` | `features/identity/{schema,server}.ts`: registerPerson, lookupPerson, flagDuplicate, previewMerge, mergePeople, reverseMerge |
| auth / T08,T10,T29 | `app/auth/page.tsx`, `lib/supabase/{client,server}.ts`, `middleware.ts` | `features/auth/{schema,server}.ts`, `lib/auth/provider.ts`: redeemInvitation, finishSetup, recoverAccount, requireActor |
| access / T09,T17,T20,T27,T32 | `features/sharing/store.ts`, vulnerable routes in audit | `features/access/{schema,server,policy}.ts`: establishContext, authorize, connect, narrowConsent, revokeConnection |
| health-records / T09,T12,T14,T15,T22 | `features/timeline/`, `lib/server/{profile-sync,medication-persistence,trust-score}.ts`, `app/api/timeline/route.ts` | `features/health-records/{schema,server,repository,time,extraction}.ts`: acceptContribution, correctReport, listTimeline, readState |
| documents / T13 | `features/documents/`, `lib/documents/parser.ts`, `app/api/documents/` | `features/documents/{schema,server,worker}.ts`: saveOriginal, getPreview, retryExtraction |
| ai-chat / T11,T16,T24 | `features/chat/`, `features/ai-assistant/`, `lib/ai/`, `app/api/ai/` | `features/ai-chat/{schema,server,retrieval,worker}.ts`: sendMessage, listMessages, assess, assistPractitioner |
| patient / T10–18 | `app/(patient)/`, `features/{health,profile,settings}/` | `features/patient/components/`, `features/patient/server.ts`: compose authorized home/account/care projections |
| practitioner / T19,T20,T25 | `app/(clinician)/`, `features/clinician/` | `features/practitioner/{schema,server}.ts`, components: submitCredentials, reviewQualification, listPatients |
| clinical-care / T21–24,T28 | `features/clinician/store.ts`, verify-memory route | `features/clinical-care/{schema,server,requests}.ts`: savePrivateNote, saveDraft, finalizeEntry, correctEntry, createRequest, finalizeResult |
| appointments / T18,T25 | Seeded upcoming/dashboard cards only | `features/appointments/{schema,server}.ts`: availability, request/accept/reschedule/cancelAppointment |
| messaging / T18,T25 | No durable care-message service found | `features/messaging/{schema,server}.ts`: sendMessage, listThread, markRead |
| organizations / T26–29 | No complete owner found | `features/organizations/{schema,server}.ts`: approveOrganization, manageMembership, assignPatient |
| audit / T09,T33 | `lib/security/audit.ts` | `features/audit/{schema,server}.ts`: appendEvent, authorized audit read; no generic clinical browse |
| shared UI / T03,T06 | `app/globals.css`, `components/ui/`, `features/shell/` | `components/ui/`, `components/layout/`; reuse measured visuals, no business policy |

Every planned feature also receives `README.md` and meaningful `server.test.ts` when its implementation begins. The README must list actual files/callers, policy, schema ownership, failure locations, commands and future consumers. Paths are design defaults; reconcile changes in this map before claiming existence.

Dependencies and exact T06–T36 work packets: [task packets](tasks/rebuild-packets.md). Domain shapes: [identity/access](contracts/identity-access.md), [clinical records](contracts/clinical-records.md). Visual reference: [guide](design/UI_GUIDE.md). Current behavior/keep-adapt-replace rationale: [audit](audit/current-state.md).

## Implemented patient owners — 2026-10-11

## Practitioner and Organization Owners - 2026-10-13

| Tasks | Owner and entry points | Verification |
| --- | --- | --- |
| T19-T20 | [Practitioner](../features/practitioner/README.md), profile.ts and patients.ts; /clinician, /api/practitioner, /review | practitioner-profile, direct-connections; direct HTTP |
| T21-T23 | [Clinical care](../features/clinical-care/README.md), work.ts, entries.ts, requests.ts; both workspace transports | clinical-work, clinical-entries, service-requests |
| T24 | ai-chat/practitioner.ts -> authorized retrieval -> reviewed suggestion | practitioner-ai, live provider gate remains explicit |
| T25 | practitioner/daily.ts with appointments and messaging | care tests and verify-direct-http.mts |
| T26-T28 | [Organizations](../features/organizations/README.md), server/membership/assignments/care; /organizations and /api/organizations | organization approval/assignments/care; real HTTP |
| T29 | [Identity](../features/identity/README.md) assistance.ts -> auth/server.ts; /organizations/assistance, /review/identity | real Keycloak identity-assistance and auth |
| T30-T31 | identity/duplicates.ts, merge.ts; patient/staff flags, /review/duplicates, /api/review/merges | duplicates, merge, verify-organization-http.mts |

Evidence: [recovered practitioner phase](tasks/practitioner-phase-evidence.md), [organization phase and dependency mind map](tasks/organization-phase-evidence.md). Read the latter for actual outcomes, open external gates and safe resume instructions. Current organization and identity producers reuse T07-T18 services; they do not replace the existing patient/direct engines.

## Patient Owner Index

| Owner | Actual entry points |
| --- | --- |
| T10 account | features/patient/account/{server,entry,profile}.tsx/ts, features/auth/server.ts; /api/auth/[operation], /api/account; account README. |
| T11/T12/T16 AI | features/ai-chat/{server,retrieval,assessment,chat-view}, extraction/{server,time,status-view}; server-only lib/ai/gateway.ts; /api/chat, /api/extraction, /api/assessment. |
| T13 documents | features/documents/{server,parser,documents-view}; lib/storage/local.ts; /api/documents and /api/documents/[id]; documents README. |
| T14/T15 records | features/health-records/{timeline,current-state,corrections,timeline-view,health-view,correction-form}; /api/records, /api/health, /records/[id]. |
| T17 controls | features/access/patient-controls.ts and patient-controls-view.tsx; features/patient/account/export.ts; /api/connections and /api/export. |
| T18 care | features/appointments/server.ts, features/messaging/server.ts, features/patient/care/{server,care-view}; /api/care; appointments/inbox/requests routes. |

Patient migration sequence follows the three foundation migrations; every filename is unique and active migrations are under supabase/migrations. The legacy table above is historical navigation only. Current implementation and remaining acceptance gates: [patient evidence](tasks/patient-phase-evidence.md). Tests use real isolated native PostgreSQL and provider integrations, never the unrelated connected hosted project.
