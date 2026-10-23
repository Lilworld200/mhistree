# Practitioner dashboard/profile and daily-work pages — 2026-10-22

Status: verified within this source/UI slice; no deployment or release certification. Existing local branch codex/sharing-connections retained with earlier owner changes.

## Requirements and source packet

Read AGENTS/WORKFLOW and practitioner/design/identity-access/clinical-record contracts, current practitioner/appointment/message/organization consumers, UI guide/catalog, installed Next page conventions and full playbook T19/T22/T23/T24/T25. Retained T20/T21/T27 and appendices define context, private work, assignments and evidence boundaries. The original playbook/rendering remains authoritative; no source ambiguity required a new interpretation.

| Source requirement | Implemented surface and boundary |
| --- | --- |
| T19: one account, reviewed credentials/status, no self-assigned qualification | /clinician/profile shows immutable submitted details, current status and reviewed capabilities; pending/rejected users return to the existing staged application. Approved/suspended credentials are not editable here. |
| T25: Today, appointments, unread, requests/results, reminders and notifications | /clinician/dashboard renders existing authorized direct-care projections with separate sections and truthful empty states. Author-private reminders remain author/context scoped. |
| T25: provider availability and booking operations | /clinician/schedule provides current availability, appointment filters and explicit accept/decline/reschedule/cancel panels. Existing service version/concurrency/privilege/consent guards remain authoritative. |
| T25: provider text consultations | /clinician/inbox indexes direct patients/unread counts and opens the selected existing care-text-inbox workspace anchor, where durable delivery/read/compose operations already live. It is not patient AI chat. |
| T23: narrow requests and versioned results | /clinician/requests separates outstanding/finalized/paused/cancelled views and links to the selected requests-results workspace anchor. No inferred orders, autonomous publication or automatic paused-work restart. |
| T21/T22/T24: private work, human finalization, bounded AI | Remain within the existing selected patient/acting-context workspace, with private-work anchor; no generic notes/AI page is added that would lack context. |
| T27: organization assignments remain independent | Dashboard links current assigned patients with original organization/connection-or-basis/assignment IDs. Other daily pages clearly cover direct care and send organization work through My patients. No grant union or silent fallback. |
| Owner UI criteria | Existing neutral cards, Manrope, pills/icons; no marketing palette or redundant overview counters. Desktop content headings, mobile topbar actions, responsive cards and accessible shared SidePanel. Mode switching remains on /profile. |

## Implementation and contracts

daily-page.tsx composes current approval, daily projection and assigned patients for four thin routes. Pending/rejected/suspended profiles redirect to professional profile before daily data loads. today-view.tsx/daily-types.ts own presentation/filtering/time formatting; schedule-panels.tsx owns selected mutation forms and current failure state. Times are formatted in the stored timezone when that timezone is shown. Appointment acceptance sends no irrelevant slot fields; reschedule requires dates; destructive actions require confirmation. Denied access clears displayed care and closes sensitive panels. Existing /api/practitioner/today and workspace/profile services are reused without SQL, provider or schema changes.

ProfessionalProfile is now a credential/status/history screen rather than a duplicate signup/upload form. Existing immutable submissions supply name/profession/registration/jurisdiction/document label; no invented reviewer, licence or registry evidence. A submission is explicitly separate from approval. Navigation adds Schedule/Care inbox/Requests & results to approved professional work; default sign-in remains /clinician/dashboard.

Limits: practitionerToday is still a direct-only, bounded producer (first30 active direct connections,15 work rows per connection/query,100 availability slots and50 notifications; directPatients itself caps100). Profile history caps10. Worklists do not claim lifetime completeness or automatic organization aggregation. Calendar support is an appointment/availability schedule, not external calendar integration. No new permission, patient connection, credential approval or real clinical result was created for the owner’s hosted account. Existing clinician document-upload and T32–T36 launch gates remain separate.

## Verification

- Final five-file UI/routing regression39/39 passed: daily/profile controls, current access clearing, appointment/reschedule/removal confirmation, explicit patient anchors, status/capability presentation, non-approved route denial and existing sharing/patient/navigation behavior.
- Real disposable native PostgreSQL integration8/8 passed across practitioner-daily, care and practitioner-profile: current appointments/unread/author reminders, unrelated-account isolation, overlap/privilege/version failures, revocation removal, suspension denial and existing reviewed credentials/care services. No hosted database or real patient data used.
- Full ESLint, final production build including TypeScript, client-secret scan and whitespace check passed. The build used reviewed network access for the existing Manrope font. Earlier lint caught nested render-time helper components; moved these to module scope before final passing checks.
- Synthetic local production preview checked desktop1280x720 dashboard/profile and mobile390x844 profile, schedule/action panel, inbox DOM and request filters. Profile document width390 with content350; no observed horizontal overflow. Existing menu/focus behavior and closing the appointment panel returned focus to Manage appointment. One native AX observation became stale/inconsistent; switched to read-only DOM snapshots and the documented tab screenshot API to verify actual pages.
- Evidence: evidence/practitioner-workspace-2026-10-22/{dashboard-desktop,profile-desktop,profile-mobile,schedule-mobile,requests-mobile}.png. Captures precede the final explicit stored-timezone formatter/route-title correction; those final changes passed UI/static/build checks. No browser booking, grant, credential or clinical mutation was submitted. Synthetic preview DB/server stopped, browser tab closed and viewport reset.

## Handoff

Read this record, the practitioner README, daily-page/types/view and schedule-panels for follow-up layout changes. Existing daily/profile/appointment/message/clinical-care services retain domain authority. Additional future work must preserve the direct/org split and cannot declare release completion from these UI/service checks.
