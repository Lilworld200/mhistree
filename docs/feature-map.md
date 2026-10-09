# Feature ownership and bounded navigation

Planning revision 2026-10-09. Existing paths below are audited; target paths are **planned, not implemented**. Start with AGENTS and WORKFLOW, then the owning row, contracts and its direct callers. Do not search the whole repository by default.

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
