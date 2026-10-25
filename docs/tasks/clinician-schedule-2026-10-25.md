# Calendar-first clinician schedule — 2026-10-25

Status: verified locally; owner-authorized hosted migration applied. Source remains uncommitted on `codex/sharing-connections`, starting HEAD `376fa0e`, at `C:/Users/maseglo.com/Documents/FS-projects/Mhistree/mhistree`. No application deployment performed.

## Goal and read packet

Owner replaces /clinician/schedule appointment/availability cards with a month calendar and pending appointment-request card. Confirmed dates black, past dates faded, empty/request-only dates unfilled, adjacent booked dates joined into a continuous week-bounded band. Date selection opens full-height right desktop drawer/centered mobile popup for details, creation and editing. Recent history replaces former availability header action.

Read AGENTS/WORKFLOW; complete playbook T18/T25 and Appendices A–D; clinical-records/identity-access contracts; practitioner/appointments READMEs and feature map; UI guide; current daily services, booking/version/overlap services, transports and shared SidePanel. Consulted installed Next route-handler guidance. Baseline UI/routing:21/21 passed. Git required per-command safe.directory because sandbox user differs from checkout owner; no global Git config changed.

## Implementation and consumers

- `features/practitioner/schedule-view.tsx`: calendar/request composition, month reads, recent history, refresh/current-access clearing, selected date/booking and focus return fallback when an approved request disappears.
- `schedule-calendar.tsx`: interval-overlap local date mapping, joined confirmed bands/circles, past-state fill and date-labelled keyboard buttons, month/today controls and device timezone.
- `schedule-day-panel.tsx`: all bookings on a date, connected-patient booking, create/update/remove availability, patient-name selection from current connections and truthful past/read-only states. Today defaults to the next half-hour if09:00 has passed.
- `schedule-panels.tsx`: approval/decline/cancel/versioned time changes with existing time prefilled; old standalone availability panel removed.
- `today-view.tsx` delegates schedule and retains existing dashboard/inbox/request behavior. `daily-page.tsx` supplies an initial month envelope; `daily.ts` validates maximum35-day range and queries interval overlap plus future requests. At most100 appointments per each of30 active direct connections; truncation remains explicit. No organization/direct permission union or lifetime fetch.
- `components/ui/side-panel.tsx` adds optional scoped className. Schedule-only CSS uses560px maximum full-height right drawer above980px, centered popup below, scroll containment and reduced-motion handling. Existing panel consumers retain defaults.
- `appointments/server.ts`: `createPractitionerAppointment` shares validation/transaction/idempotency/overlap with requests, derives clinician from current actor and requires their own active direct appointments.manage context. Writes accepted+`appointment.booked` audit atomically. Confirmed appointments remain accepted on their own direct clinician's reschedule; patient/pending reschedules remain requested. Patient names are linked identity data, not appointment text.
- `/api/practitioner/today` GET accepts `from/to`; POST adds owner/version-checked availability `update`. Workspace POST adds `appointment-create` with `{connectionId,requestKey,slot}`; client-supplied practitioner identity is rejected.

Existing service boundaries still own consent, approval/qualification, overlap exclusions, version conflicts, pause/revocation and notification deduplication. No external calendar, account/clinical identity change, new table grant or broad clinical authority.

## Database rule and hosted application

The old booking trigger rejected every accepted booking outside advertised availability whenever any active availability existed. Added source migration `20261025122238_clinician_calendar_booking.sql` via installed Supabase migration-new command. Its trigger exception requires current direct context/connection, actual signed-in practitioner ownership and current `can_participate(...,'appointments.manage')`; other contexts keep the prior availability rule. The existing trigger remains installed, overlap constraints unchanged, search_path empty and public EXECUTE revoked.

Owner explicitly approved applying this tested migration in chat. Confirmed project `mhistree`/`wcsizaumvthtkilrqsjr`, ACTIVE_HEALTHY, and inspected only the prior trigger/migration metadata. Applied successfully with remote version `20261025122835`, name `20261025122238_clinician_calendar_booking`. Post-query confirms owner/current-care checks present and anon/authenticated EXECUTE both false. No hosted patient rows read or changed, no synthetic identities inserted hosted. Source migration and deployed body match.

Security advisor reports existing default-deny RLS/no-policy INFO and legacy public-schema mutable-search-path/extension/handle_new_auth_user warnings plus disabled leaked-password protection, already documented in WORKFLOW. None identifies the changed trigger. No unrelated legacy function/extension/Auth changes were made. This is not a full launch security review.

Used Supabase skill and official [trigger guidance](https://supabase.com/docs/guides/database/postgres/triggers). The changelog.md endpoint was attempted but web reader rejected its text/markdown content type; no dependency/provider version change was made. CLI telemetry required reviewed filesystem access; local native PostgreSQL startup and Google font fetching required reviewed execution. First sandbox integration attempt failed before tests at pg_ctl; rerun under approved local execution passed. First build failed only at Manrope network fetch, then the approved build passed. No mocks substituted for database behavior.

## Verification

- Prior UI/routing smoke:21/21.
- Final affected UI/routing/shared-panel regression:34/34 (`practitioner-daily-ui`, `practitioner-daily-routing`, `sharing-ui`, `practitioner-patients-ui`). Covers calendar ranges/past/unfilled states, connected creation payload and refresh, approval, month reload denial clearing, availability removal confirmation, read-only controls and existing daily routes.
- Real disposable PostgreSQL:8/8 (`integration/care`, `integration/practitioner-daily`) including stable-key concurrent direct booking, accepted state, outside-advertised booking, overlap rejection, patient denial, retained clinician confirmation on move, bounded month validation, availability owner/version checks and existing revocation/suspension.
- Full ESLint, TypeScript via production build, production build/routes, client-secret scan and whitespace checks passed. Final small form validation/clock/focus refinements were rechecked with affected tests/lint/typecheck.
- Isolated real HTTP/production browser preview with fresh native DB/synthetic patients at1280×900 and390×844. Provider authentication and AI endpoints blocked. Verified booked/past ranges, empty-day popup, saved patient booking (Oct30), request approval adding Oct26, reschedule clearing Oct30/filling Oct31, selected-date details and history. Desktop drawer measured560×900 and flush right; mobile popup366.4px wide with12px side margins; both document widths equal viewport width. Modal focus trap/return exercised. Actual OS reduced-motion, Safari, zoom and exhaustive assistive-technology coverage remain unverified.

Evidence directory: [screenshots](evidence/clinician-schedule-2026-10-25). `mobile.png` shows initial calendar/request layout; `mobile-popup.png` shows creation; `mobile-booking-saved.png` and `mobile-request-approved.png` show real synthetic mutations. The complete990px desktop capture is `desktop-narrow.png` (document width990px). The1280px desktop screenshots are clipped by the browser adapter's capture surface despite measured1280px DOM; use recorded DOM dimensions for viewport evidence, not a pixel-complete desktop screenshot claim. Preview data are synthetic only.

One initial preview seed tried inserting past bookings after advertising an unrelated slot; the existing trigger correctly denied it. Stopped that specific failed local DB and moved seed availability after historical bookings. Subsequent preview uses the new migration. Temporary preview/server/native DB stopped at completion; no source or data deletion/reset.

## Handoff

Source/UI and source/hosted booking rule complete. Keep future work bounded to schedule owners above. Existing clinician-upload gap and T32–T36/full release/human clinical reviews remain separate; this task does not certify them. Recheck current context, booking guards and source migration before subsequent scheduling changes. Do not edit names in appointment records to change a person's identity.


## Upcoming preview and height follow-up — 2026-10-25

Latest owner revisions replace mobile Recent history with Upcoming schedule, use the right desktop space for the nearest confirmed booking, and require that card's empty/filled height to match the calendar with internal overflow and wrapped text. Desktop retains History/Refresh; confirmed candidates are selected independently of the browsed month through a current authorized per-connection upcomingAppointment projection. Pending requests remain unconfirmed and separate. No schema, permission or hosted mutation was needed.

Implementation: `schedule-view.tsx` shares the upcoming detail component between inline card/popup and preserves the mobile trigger when moving from the popup into the appointment editor. `daily.ts` performs a one-row accepted/non-ended query inside existing withAccess for each bounded active direct connection when calendar range is selected; daily-types adds an optional projection. CSS flex stretch plus size containment keep the calendar as the row height owner, and schedule-next-scroll handles keyboard/touch scrolling with wrapped text. At narrow desktop the row may wrap with320px minimum upcoming height. Mobile card remains display:none and popup uses the existing panel.

Verification:27 UI/routing checks and5 real local PostgreSQL daily checks passed; native assertions confirm next booking remains available while viewing an older month. Production build/TypeScript and targeted ESLint passed. Real synthetic preview1440×1000: calendar633.2×478.85px, upcoming373.2×478.85px, document1440px. Mobile390×844: inline card hidden, popup366.4px wide with12px margins, Upcoming schedule button and View appointment transition verified. No hosted patient data, provider auth or AI calls.

Layout stress fixture uses the built app CSS with a synthetic478px calendar reference, not actual booking rows. With500 long-text entries: card478px, region380px high/118380px content high,395px scroll/client width; End moves internal scrollTop to117999.2px while card remains478px. Empty state also remains478px. This tests layout robustness, not a change to the nearest-only display contract or a claim of unbounded appointment loading.

Evidence: upcoming-desktop.png (initial placement); upcoming-fixed-height-desktop.png; upcoming-mobile-popup.png; upcoming-500-scroll.png. Desktop capture clipping caveat above applies. Temporary preview/browser/native test DB cleaned up; source uncommitted. Future follow-ups should read these owner modules and retain current access and bounded loading.
