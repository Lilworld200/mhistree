Viewport containment2026-10-29: preserve existing card geometry and tokens inside one authenticated app viewport. The stage fills the root, with desktop sidebar/main and <=980px topbar/main grid tracks. Internal content owns scrolling; shell cards do not move with document scrolling. Public pages retain document scroll. Explicit border-box and zero grid/flex minimum sizes prevent expansion. See ../tasks/viewport-containment-2026-10-29.md and ../../components/layout/README.md for measured synthetic evidence and device limits.

Care Notes selection correction2026-10-28: use two left-aligned native radio inputs with visible18px selection dots,44px label touch targets and an unboxed wrapping row. Selected label uses full emphasis; unselected label is grey with reduced opacity. No segmented pill or toggle background. This supersedes the segmented destination presentation below; form/save behavior stays the same.

Care Notes forms2026-10-28: two equal pill segments labelled Private Note and Patient Record, dark selected surface and readable grey inactive text, keyboard focus ring and44px-plus targets. Use existing neutral surfaces/raised Btn pills, clear topic/category labels,16px inputs, two desktop field columns and one below600px. Private mode has optional title/content and a separate Previous private notes button. Record mode shows only relevant fields plus a faithful preview once required details are complete, explicit review and Save Patient Record. No raw Type picker or patient-record history list in this panel. The private history supports retained editing and explicit paused-note resume/archive. Current-component synthetic desktop/mobile browser check passed; broader real-device/a11y verification remains separate.

Patient identity card2026-10-28: use a two-row grid inside the existing merged card. Profile image/initials at top left, permission-gated glass Care notes pill at top right; name, DOB and Mhistree ID left-aligned below the image. Keep today's report below its existing divider and preserve attached Health/Requests & results folder tools. Use22px desktop/16px mobile padding, existing typography/avatar sizes and wrapped identity details. This supersedes the previous absolute action positioning and mobile72px top clearance. Synthetic browser layout checked on desktop and390px mobile; full authenticated device verification remains separate.

Contextual care cards2026-10-27: use visible multi-select checkbox cards, editable prefilled question, shared Btn pills and existing neutral raised surfaces; no recipient dropdown. Explain shared organization inboxes and per-destination results. Show the exact Send review question before permitting a typed positive; local edits clear its binding immediately. Old cards retain explicit buttons, without consuming chat answers to newer questions. See ../tasks/contextual-care-2026-10-27.md.

Reviewed care-action cards2026-10-27: inside the owning assistant bubble, use the existing account-form/Btn/qrow family, neutral card token,20px card radius, shared pill actions,16px editable/select inputs and wrapped controls. Show actual direct versus shared organization destination, editable draft, explicit Send message/Request appointment, Dismiss, Refresh options and private draft/error status. No automatic send or clinician-monitoring language. Component: features/ai-chat/care-action-card.tsx. DOM interaction tests cover confirmation, lookup failure, booking without slots and organization labels; real rendered/mobile acceptance remains unverified in the Android terminal without browser tooling.

Voice recording UI (2026-10-27): speech/recording-controls.tsx reuses shared IconBtn for small red cancel X above and right solid square Stop-to-review control in a compact microphone-slot capsule. Existing detector RMS drives three dots stretching into rounded bars; silence restores dots. Neutral card styling and reduced-motion support; no additional audio stream or provider call. Automated checks passed; rendered/device acceptance unverified.

Conversation titles2026-10-27: sidebar/mobile drawer keep existing navigation styling and truncation, displaying opening preview then generated topic title, with full title/date in the native tooltip. New chat allows typing during memory preparation; shared muted status/notice and pill Btn provide Retry/explicit continuation on failure. No new header strip or notification behavior. Interaction verified in jsdom; rendered device acceptance remains pending.

Ask Mhistree review2026-10-26: retain the current patient folder/card and pill buttons. The assistant panel shows current supported recording categories and editable per-item neutral review cards, with visible event precision/status/medication-use state, source disclosure, clarification gaps, and explicit Yes-save-to-destination / No-save-as-private-note actions. Disable record save while details remain incomplete. Readonly scopes show no save controls. Preserve input on service failure and clear sensitive conversation/proposals on access denial. The panel uses existing typography, card surfaces, accessible native textarea/labels and shared Btn; review textareas use16px text. No new rendered visual measurements claimed.

Owner button-radius refinement (2026-10-26): Care notes, Health summary and Requests & results use fully rounded pill corners (999px radius) on desktop and mobile, matching the existing button family.

Owner folder-card refinement (2026-10-26): put Health summary and permission-gated Requests & results in an attached folder-style tab at the top left of the merged patient card. Keep Care notes as a glass icon-and-text button at the top right inside the card; it need not be circular. Tighten the card inner spacing. This supersedes the circular icon and separate Requests & results tile presentation; existing access and panel behavior remain unchanged.


Owner refinement (2026-10-26): Health summary is the single entry for the report overview, authorized medication use/prescriptions and category-filtered, paginated Shared history. Remove separate Medications and Shared history actions. Care notes uses a fully circular glass icon button at the top-right inside the merged patient profile card, with an accessible name. Keep permission checks and focus return.
Patient details2026-10-26: active direct/org patient list cards occupy one column on every breakpoint, with clickable full card, initials/name/context, authorized report overview and permitted medication/prescription/recent-result content; no Connected/Assigned pills, scope chips or Open record button. Pending approval scope remains readable as ordinary text. On the direct patient page, merge identity and overview into one neutral rounded card. New glass icon buttons (Health summary, Medications & prescriptions, Care notes) sit before it; desktop groups them beside Refresh, mobile places Back to My patients in the top-right app bar and hides Refresh. The medication action has a shorter mobile visual label. Use layered directional highlight/shadow, translucent gradient and18px corner radius instead of the existing pill button; touch targets at least44px wide/70px high on narrow mobile. Existing back/refresh use shared Btn. Remaining record/AI/result/message cards open focused panels. Focus returns to the triggering control. Latest screenshots/measurements: docs/tasks/patient-details-2026-10-26.md.

Connection approval refinement2026-10-25: retain the short explanation and one labelled switch in the existing responsive panel. Toggle immediately saves; remove Save/confirmation/category forms. Keep visible saving/saved feedback, disable while in flight, and restore previous state with reload on failure. A previously narrow patient scope is described and retained. Match raised pill actions with a recessed gradient track, dimensional light knob, upper/left highlights, lower shadows and dark enabled track. Keep focus-visible ring and reduced-motion support; wrap mobile labels with a fixed-size switch at the right.

Profile refinement2026-10-25: preserve the original patient blue hero gradient/radial highlight/corner shape, separate from practitioner Today. Name and Edit profile (shared soft Btn, trailing edit icon) sit at top; stored Mhistree ID/Copy ID occupy the center. Read-only personal/contact/account cards below, with workspace only when currently eligible. Move all forms into the right-side desktop editor/mobile inset scrolling popup; use the same shared soft button for Save profile/contact actions. Wrap long names, emails and IDs. No dashboard monitor/grid/reminder treatment or extra clinical data in profile.

Upcoming schedule refinement2026-10-25: desktop uses a right-side upcoming card aligned with the compact calendar, retaining History and Refresh in the header. Mobile replaces Recent history with Upcoming schedule and opens the card in the existing centered popup. Inline card is hidden on mobile. Stretch the desktop card to calendar height even when empty; use size containment and an internal scroll region so content cannot enlarge it. Wrap long/unbroken text. Narrow desktop may wrap the cards, with320px minimum upcoming height. Calendar cell sizing is unchanged.

Calendar density refinement2026-10-25: omit “Your calendar” and the timezone sentence. Above980px use a720px maximum card,48px date rows/8px gaps and44px circles, with joined-band endpoints22px from center. Mobile sizing is retained. These supersede the initial schedule density.

## Clinician calendar — 2026-10-25

Owner replaces the old appointment/availability cards with a neutral month calendar and a separate pending-request card. Reuse Manrope, existing cards/shadows/pills. Black confirmed dates join adjacent dates into rounded week-bounded bands; isolated dates are circles, completed dates use faded black with dark readable text. Pending requests/empty dates remain unfilled. Header uses Recent history instead of availability; mobile places it in the shell topbar. Date editors use `SidePanel` with schedule-only class: width up to560px/full viewport height at desktop, sliding from the right; at980px and below use a centered, rounded popup with scroll-contained body and24px total horizontal margin. Respect reduced motion, trapped/returned focus, date-labelled buttons, current-day indication and truthful bounded direct-care data. Screenshots/evidence: `docs/tasks/evidence/clinician-schedule-2026-10-25` and task record.

## Today raised white rim — 2026-10-23

Blue card uses a1px translucent white border and button-inspired directional inset highlights/lower shading, white lower edge and layered blue outer shadows. Preserve current geometry/content; no CRT-specific additions.

## Compact Reminders label — 2026-10-23

Drawer header is Reminders with count/chevron, no lock. Empty heading is No reminders without a lock. Closed toggle48px; expanded spacing unchanged. This supersedes58px closed header below.

## Today glass finish — 2026-10-23

Keep monitor blue as the main surface; apply a restrained radial/diagonal white sheen, translucent inset edges, soft blue shadow and14px backdrop blur/saturation. Pulse line has a light glow. Closed reminder header is58px, preserving44px minimum target and expanded spacing. No extra inset content surface.

## Today monitor surface — 2026-10-23

Latest owner refinement removes white activity inset panels. Render white activity/empty text directly on the blue hero with a faint24px grid and a static decorative pulse line (aria-hidden; no vital values or live-monitor claim). Keep min-height360px even empty, left-aligned copy and original outer rounding/inset white drawer. Mobile Refresh belongs to the existing navbar, while desktop retains toolbar Refresh. Three workspace links stay above the card with44px mobile targets. Activities/reminders still disclose independently.

## Today toolbar refinement — 2026-10-23

Latest owner instruction moves Schedule/Care inbox/Requests & results and Refresh into a wrapping toolbar above the blue card. Today and its care-update/private-reminder subtitle stay inside blue with white text in light mode. Mobile keeps shell Today and hides the repeated card heading. Narrow overlapping reminder drawer stays unchanged. This supersedes inside-card action placement below.

## Today wireframe refinement — 2026-10-23

Latest owner wireframe supersedes the flush/full-width attachment below. The blue card is a complete rounded28px foreground surface (z-index1); the narrower white drawer is inset clamp(14px,2.2%,26px) on each side with28px overlap/padding behind it. Outer wrapper is transparent and isolated. Desktop Today/subtitle and refresh live inside blue; mobile hides that repeated heading and retains shell Today. Refresh is inside blue on both sizes. Remove Your workspace/Recent activity headings and bell. Internal feeds remain pending further owner-directed changes.

## Practitioner Today connected card — 2026-10-23

Owner revision supersedes the dashboard section grid below. Reuse the actual .hero blue linear gradient and white radial highlight from /health, joined without a gap to a white reminder drawer. today-dashboard.tsx applies28px outer corners, neutral readable inner activity rows and existing pill/icon language. Put the three daily links inside the blue area. Activities preview3/newest-first with Show all activity/Show less; reminders start closed with count/chevron/grip and expand independently. Native buttons expose aria-expanded/controls; collapsed content is inert, grid-row height transitions last.22s and are removed for reduced motion. Expanded lists cap at min(60dvh,520px). Mobile wraps shortcut pills with44px minimum hit areas. Preserve source limits and current access. Profile grids and other daily pages retain existing styles.

Owner update, 2026-10-16: `71121bd` is the selected reference for restoring existing page UI. Read [snapshot-71121bd.md](snapshot-71121bd.md) alongside this earlier measured guide. Current product/auth/access contracts remain authoritative for behavior.

# Preserved interface guide — T03

Practitioner daily/profile revision2026-10-22: reuse current page spacing, neutral24px cards, Manrope, shared icons and soft/dark pill actions. Dashboard groups actual care into two-column sections collapsing at1100px; profile uses identity/status cards and read-only credential/capability grids. Daily/profile headers hide at980px in favor of mobile topbar actions. Schedule manages one selected booking/availability interval in SidePanel instead of repeated inline forms. At680px daily shortcuts/request filters use compact grids and cards/panels wrap content. No new palette or speculative marketing/summary metrics. T19/T23/T25 criteria drive content; no clinical/AI work outside a selected authorized patient context.

Practitioner My patients revision2026-10-22: apply refined Sharing cards, existing typography, search pills and dark/soft actions. Desktop shows My patients/subtitle/Add patient; at980px and below the content header hides and Add patient uses the existing topbar action slot. Direct/org/pending/ended tabs retain counts; no overview cards. Two-column patient cards collapse at680px; mobile filters form a two-column grid. ID lookup/registration/consent use the same accessible SidePanel primitive as Sharing; requested categories retain the established checkbox tile treatment. These are implemented layout choices within the selected visual system.

Sharing refinement2026-10-22 supersedes the overview described below: remove the control-summary and both count cards. At980px and below, hide the in-content title/subtitle/header action and put Access history in the shell topbar next to Sharing. Above980px preserve the desktop title/subtitle/history header. Filter counts remain on the existing tabs.

Sharing layout revision2026-10-22: reuse current soft neutral card24px radius, existing page header/content padding, Manrope, shield/clock/steth icons and soft/dark pill actions. Content is reorganized into overview, practitioner search, connection/request/ended filters, separate direct/org card groups and a secondary record-controls disclosure. Consent and structured history use Radix side panels (560px maximum,16px desktop inset; mobile8px inset), with focus trap/return and scroll containment. Search stacks and connection cards become single-column at680px. This is a new owner-requested content/layout arrangement within the existing visual system, not measured fidelity to the old sharing layout.

Owner spacing override2026-10-20: current account-card CSS uses32px equal padding rather than the earlier40px vertical/32px horizontal recipe. Final navigation removes its additional bottom margin; Other options uses4px grid gaps between divider and actions after feedback that12px was excessive. These are implemented CSS values, not newly measured screenshots.

Owner override2026-10-20: patient /auth sign-in/sign-up now place title and health-story subtitle left, logo top right. Scoped account-auth-header flex CSS replaces the earlier centered header only for those modes. Professional/setup/code header layouts remain as before; original measurements below describe the earlier reference, not measured geometry of this update.

2026-10-09, original application at commit `2c8c46c`. Read before every UI task. Visual authority is the inspected application, not the PDF. All dimensions below are CSS pixels at normal zoom. References contain guest/synthetic UI only. No authenticated patient content was captured.

## Verified foundation

`app/layout.tsx` loads Manrope through next/font/google, Latin subset, swap display, `--font-manrope`. Computed font is Manrope with generated fallback and system-ui/sans-serif; body 16px/24px, letter spacing -0.01em. Do not substitute the README's Geist description. Exact font file/license must be packaged and checked for portable offline reconstruction; build-managed font output is not an original asset manifest.

Light tokens in `app/globals.css`, corroborated by rendered chat:

| Meaning/token | Value |
| --- | --- |
| stage / shell / shell2 / card | #f3f3f2 / #ececeb / #f1f1f0 / #f6f6f5 |
| ink / ink2 / ink3 | #181818 / #6e6e6e / #9a9a9a |
| hero1 / hero2 | #69a5ff / #347bdd |
| green / amber / red | #2f8f5b / #c08a2d / #cc5348 |
| border light / subtle | white at .8 / .55 alpha |
| sh1 / sh2 / sh3 | 0 3px 8px black .05 / 0 6px 14px black .06 / 0 22px 45px black .1 |
| Primary button | gradient #242424 to #0d0d0d, white text, white .14 border; 0 7px 15px black .22 and inset 0 1px 1px white .28 |

Dark tokens exist in source but were **not rendered/contrast-verified**: stage #0e0e10; shell #191a1c; shell2 #1f2023; card #28292c; ink #f4f4f5; secondary #a8a8ad; tertiary #77777c. Preserve source as reference; do not claim dark-theme acceptance. Theme preference was not changed during audit.

## Reconstructing the representative chat page

At 1440×1000: stage padding 20, columns 288 and remaining width, gap 20. Sidebar begins (20,20), size 288×960, radius 28, padding 18px 12px. Main shell begins (328,20), 1092×960, radius 32. Navigation rows are 44 high, pill radius 999, horizontal padding 14, gap 11; labels 13.5px weight 700. Use the original black/white Mhistree logo variants, not text approximations when assets exist.

The main chat has a top context/header strip, flexible central empty-state hero, wrapping suggested-action pills, and bottom composer. It is a flex column; do not position the hero with fixed screen coordinates. Empty heading and helper text must match the saved reference. Composer desktop padding 16px 22px, gap 10; rounded input padding 13px 20px, weight 600, measured 14px/21px. Its 1440 reference rectangle is approximately (458.8,913.9,878.4,48.6). Preserve overall density but repair mobile input to at least 16px during implementation, documenting the intentional small difference.

At width ≤980: sidebar hides; mobile topbar appears and layout becomes one column with 12px padding/gap. At 390×844 the topbar is approximately (12,12,366.4,58.8), radius 20, sticky top 12. Composer padding becomes 12; general scrolling content 20px 16px 96px. Main shell minimum height follows viewport minus 96. Empty action pills wrap; no horizontal document overflow was observed at 390. The source includes additional 900/1200 layout breakpoints; provider grids collapse by 1200 and three-column patient grids activate from 1200.

The page transition uses opacity and vertical movement (entry 14px, exit -10px), duration .26s, cubic-bezier(.22,1,.36,1). Dialog scrim opacity lasts .18s; centered spring damping26/stiffness320; side damping30/stiffness300. These are source-observed values, not measured frame timing. Reduced-motion behavior remains to be repaired/verified.

## Reconstructing the representative button

Use `Btn` in `components/ui/button.tsx` with `kind="soft"` or `kind="dark"`, optional `sm`, icon, and `asChild` for links. CSS: inline flex, center alignment, 8px gap, pill radius999, 1px border, 13.5px/weight800. Regular buttons height50; dark padding0 22, soft0 20. Soft background is card-to-shell gradient with sh1 plus white inset highlight. Active translates1px/scales.99. Focus is 2px currentColor outline offset3. Disabled opacity .55. IconBtn defaults46 square/circle with icon round(size*.42); caller can override. A missing title needs an explicit accessible name. Do not reuse the visual button as permission enforcement.

Example: `<Btn kind="dark" icon="plus">New chat</Btn>` (confirm icon name against icons.tsx when coding). See catalog for dialog and source/status semantics.

## References and observed interactions

| Artifact under reference/ | Viewport/state |
| --- | --- |
| chat-desktop-light.jpg | 1440×1000, guest empty chat |
| chat-mobile-light.jpg | 390×844, same state |
| chat-laptop-light.jpg | 1366×768, empty chat |
| chat-ultrawide-light.jpg | 2560×1440, empty chat |
| navigation-mobile-focus.jpg | 390×844, open navigation, Close menu focused |
| auth-desktop-light.jpg | 1440×1000, empty sign-in |
| auth-required-field.jpg | 1440×1000, native required-field validation |
| auth-mobile-light.jpg | 390×844, sign-in with first field focused |
| chat-mobile-measurements.json | DOM geometry/styles captured before interruption |

Opening mobile navigation moves focus to Close menu. Escape dismisses after the exit animation; immediate snapshots still show the exiting dialog. Settled observation found no dialog but no named focused trigger: return-focus repair/verification remains outstanding. Empty sign-in submission shows “Please fill out this field” and focuses the first input; no credentials entered and no signup performed.

Authenticated clinician content was blocked by its sign-in modal. Provider layout source was inspected, but dense/provider flows, patient error states, loading states, full keyboard traversal, reduced motion, contrast, Safari, throttled performance, safe areas and zoom behavior are unverified. These uncertainties remain explicit and must be verified when the corresponding implementation exists with synthetic accounts.

### Independent reproduction evidence

`auth-specimen.html` independently reconstructs the existing sign-in page and primary button using measured styles and original assets, without React, application CSS, auth handlers, backend calls or patient data. It is a visual-only reference, not an implemented authentication flow or the future contactless design. `python docs/design/serve-specimen.py` serves only whitelisted HTML/logo/build-generated Latin font at localhost3102; requires an existing legacy build. It cannot accept POST or list repository files. Do not enter credentials. Font redistribution/license remains a portability dependency.

At 1440×1000, both original and specimen card: x500,y219.05,width440,height561.90; primary button: x532.8,y642.15,width374.4,height50. At390×844 both card: x16,y141.05,width358.4,height561.90; button: x48.8,y564.15,width292.8,height50. Both mobile document widths390, no horizontal overflow. Original/reconstruction mobile JSON measurements are saved in reference/. Main geometry difference is zero at captured precision. Side-by-side visual inspection confirms layout, type hierarchy, gradients, spacing and input focus. The original optimized logo/capture has different raster sharpness from the raw source asset; no pixel-identical claim is made.

Auth page recipe: viewport-centered container padding32px16px; card max-width440, padding40px32px, radius32, white→#fafafa, shadow0 24px48px black .4. Logo height54, gap16, helper14.4px/opacity.7; brand group bottom32. Two-column segmented control padding4/radius999, label13px/800, vertical padding11, bottom28. Form column gap14; field labels12.8px/600 bottom4; input follows composer token; primary margin-top8; footer margin-top24 and13.6px underlined text. These additions make this page reconstructable from the guide.

Additional references: auth-reconstruction-desktop.jpg (1440×1000), auth-reconstruction-error.jpg (same empty-submit validation), auth-reconstruction-mobile.jpg (390×844 focused input). Native required validation moves focus to Email Address in both; specimen adds explicit label association without changing geometry. Nonessential navigation and sign-up are visual-only. T03 representative page/component preservation gate is verified within this stated scope, not a certification of every product screen.

## Necessary repairs, without redesign

Record each change and compare same viewport/state: mobile input14→16; robust composer focus indicator; nav transition:all→explicit properties; reduced-motion variant; reliable focus return; mobile close target36→44 hit area; current-context titles/skip link; chart textual alternatives. Provenance badges must retain readable labels and reflect trusted source status, not model confidence. Do not preserve fabricated success text, seeded clinical claims, timed-lease semantics or AI-inferred diagnoses merely because they appear in an attractive component.

## Asset provenance

Original repo assets: `app/assets/images/logos/mhistree_black_logo.png` SHA256 E52CAE21E8BC1898F0B14063B1D79815FEFBD82F155A1C3D86B747DB6E538B53; `mhistree_white_logo.png` SHA256 9AF09F6CFA991AD7F8C339478B308FDCDD7CD1999C7870C69DAA0F233869EC3C. Ownership/license not independently documented; retain originals, resolve redistribution before handover. `components/ui/icons.tsx` is the code icon source; audit its provenance before distribution. Starter public SVGs are not Mhistree branding. External prototype imagery is not approved production imagery. No external media was downloaded.

Comparison protocol: same synthetic state, same viewport/theme/font, settled motion; compare shell bounds, type wrapping, input/button sizes, focus/error/empty states and overflow. Record intentional accessibility differences. T06 compares its new shell/components to these references; add authenticated synthetic provider references when a safe test environment exists.
## Practitioner and organization registration — owner revision, 2026-10-21

Use the existing Mhistree auth visual language for both account registration and staged applications: centered account card (600px maximum for the additional application fields), 32px radius/padding, heading and subtitle left/original logo right, neutral shared tokens, floating-label pill fields via AuthField, dark gradient pill actions and soft secondary pills. Owner progress refinement2026-10-21 places the five progress markers outside the card: vertical left rail on desktop, horizontal row above on mobile (breakpoint800px). The outer layout is832px maximum with a200px rail,32px gap and600px form card; mobile stacks within600px. Owner refinement2026-10-21 removes the registration-type toggle; the separate patient-signup links select the route. No marketing column or navy palette. At480px and below use24px card padding, wrap headings/step names and preserve16px inputs. Everyone signs in through /auth; registration links appear only on signup. This supersedes the independent professional layout from2026-10-20. Scoped .pro-* CSS remains imported by app/layout.tsx.

## Practitioner navigation mode — 2026-10-21

Approved practitioners sign in to the professional dashboard. On /clinician and eligible organization routes, shared desktop/sidebar and mobile/drawer show Today and availability, My patients, Professional profile and eligible Organizations; no personal chat recents. Owner refinement: workspace switching lives in a shared-style Workspace card on /profile, with a pill action to /chat or /clinician/dashboard. Remove switch controls from sidebar/mobile drawer. Your account remains the navigation entry to profile; a workspace query hint retains professional navigation on that shared page. Personal pages preserve existing patient navigation. Reuse original shell tokens and icons; navigation never grants clinical authority.
Practitioner notification refinement2026-10-26: blue8px accessible dots on relevant navigation, Today Care inbox shortcut and affected patient/inbox cards. Patient-detail Health (renamed from Health summary) and Care inbox retain their existing pill/card layout with blue markers. Dot means unread care message, not clinical urgency or completed care. Dashboard renders all loaded recent activities in a keyboard-focusable bounded scroll region with common left alignment; activity expansion toggle removed, private reminder disclosure retained. No real patient screenshots or new fidelity measurements claimed.
