## Today raised white rim — 2026-10-23

CSS-only owner refinement translates the soft-button raised finish to blue:1px translucent white border, stronger top/left inner highlights, lower inner shading, a white lower edge and layered blue outer shadows. No CRT-specific styling added. Existing content, monitor motif, disclosures and48px reminder bar retained. Production build/TypeScript and diff check passed; no new behavioral tests needed for this visual-only change. Synthetic local mobile preview390x844 confirmed white rim and no horizontal overflow (document390px); evidence: docs/tasks/evidence/practitioner-dashboard-2026-10-23/raised-edge-mobile.png. Preview stopped/tab closed/viewport restored; no backend or hosted-data changes.

## Reminder drawer labels and height — 2026-10-23

Drawer title now Reminders and empty heading No reminders; removed both lock icons. Closed header reduced58px to48px (12px top/8px bottom), keeping44px minimum target and expanded spacing. Author-private filtering unchanged. Focused UI/routing21/21 passed, including label/icon assertions and independent disclosures. No new build/browser capture for this bounded text/icon/CSS refinement; prior screenshots are superseded for these details.

## Today subtle glass and compact drawer — 2026-10-23

CSS-only owner refinement adds radial/diagonal glass sheen, inset translucent edges, soft blue shadow,14px backdrop blur/saturation and a restrained pulse glow. Closed reminder header reduced78px to58px via expanded-state selector; expanded spacing retained. No interaction/data/schema changes. Focused UI/routing21/21 and production build including TypeScript passed. Native synthetic local production preview390x844 measured360px blue card,58px reminder header and390px document width; screenshot docs/tasks/evidence/practitioner-dashboard-2026-10-23/glass-mobile.png. Preview stopped, tab closed and viewport reset.

## Today monitor-style mobile refinement — 2026-10-23

Owner requested mobile navbar Refresh, a substantial empty card and a heart-rate-monitor feel. Added a faint24px monitor grid and static aria-hidden SVG pulse (decorative, no fabricated vitals/live monitoring),360px minimum card height, left-aligned white empty/activity text and transparent activity backgrounds/icons. Kept the blue gradient and narrower white reminder drawer. MobileTopbarActions now supplies dashboard Refresh; toolbar Refresh hides below980px and desktop retains its toolbar action. No service/schema/API changes.

Verification: focused UI/routing21/21 passed (including portal refresh API and decorative-wave isolation); full lint, production build/TypeScript, client scan and whitespace checks passed. Synthetic fresh-native-DB preview checked empty and populated390x844 plus desktop1280x900. Mobile empty card measured360px; document390px, transparent activity/empty backgrounds and white text; navbar Refresh exercised. Captures: docs/tasks/evidence/practitioner-dashboard-2026-10-23/monitor-{mobile-empty,mobile-activity,desktop}.png. Preview setup initially duplicated an existing fixture professional; corrected setup, stopped that disposable instance and restarted. Preview/tab stopped and viewport reset after verification. OS reduced-motion/Safari/full launch gates remain outside this change.

## Today toolbar and white heading refinement — 2026-10-23

Moved Schedule, Care inbox, Requests & results and Refresh into a wrapping toolbar before the blue card. Today/subtitle remain inside and now use white text; mobile hides the repeated heading. Narrow layered reminder drawer and existing care operations retained. Focused UI/routing20/20, affected ESLint and TypeScript noEmit passed; no new production build or browser capture for this small placement/color follow-up. Earlier screenshots precede this refinement. No backend/schema changes.

## Owner wireframe follow-up — 2026-10-23

Implemented the supplied MacBook Air - 1.png layout as a complete rounded blue foreground card with a narrower white reminder layer behind it. Drawer overlap28px; horizontal inset clamp(14px,2.2%,26px). Moved desktop Today/subtitle and the only refresh control inside blue; mobile retains shell title and inside-card refresh. Removed Your workspace/Recent activity display headings and bell, including empty-state bell. Internal feed styling otherwise retained for the owner’s next prompts. Source changes: today-dashboard.tsx callback/busy props, today-view.tsx dashboard-only header/action branching and scoped daily CSS. No service/schema changes.

Focused UI/routing20/20, full lint and production build including TypeScript passed; client-secret and whitespace checks passed. Disposable synthetic production preview verified desktop1280x900 (blue866.4px, drawer828.3px;28px overlap;28px blue bottom radius) and mobile390x844 (document390px, blue317.6px, drawer289.6px;14px inset). Desktop heading/subtitle/refresh inside card; mobile heading hidden, one refresh, keyboard Enter opens reminder drawer. Captures: evidence/practitioner-dashboard-2026-10-23/wireframe-{desktop,mobile}.png. Preview stopped, tab closed and viewport reset. Earlier flush-card screenshots/measurements below are superseded by this follow-up.

# Practitioner Today activity card and reminder drawer — 2026-10-23

Status: implemented and verified for this source/UI change; no deployment or hosted-data changes.

## Decision and read packet

Latest owner decision supersedes the Oct22 dashboard section grid and the intermediate combined-feed proposal. One connected component now uses the actual /health hero gradient/highlight for recent activities and the three daily navigation links, attached without a gap to a white, independently expandable private reminder drawer. Other daily routes retain their operations. No schema, API or clinical authority changes.

Read AGENTS/WORKFLOW; playbook T21 and T25 with Appendices A–D; identity-access and clinical-record contracts; practitioner README, current daily page/view/types/service and tests; UI_GUIDE, feature map and /health source/hero CSS. Earlier workspace task remains the broader criteria map. No PDF table/rendering ambiguity was encountered in this presentation change.

## Implementation

features/practitioner/today-dashboard.tsx owns activity created_at descending/ID tie ordering, newest-three preview, Show all activity/Show less, and a separate reminder list ordered by due_at across loaded connections with undated last. Reminder header displays the loaded count and begins closed. Native buttons with aria-expanded/controls and inert/aria-hidden collapsed content preserve keyboard/privacy boundaries. CSS grid rows animate height over220ms, disabled for reduced motion; list scrolling caps at min(60dvh,520px). Navigation stays outside the scrolling list. Reminders retain private labels, explicit due dates and private-work links; activity links retain original patient anchors.

today-view.tsx delegates dashboard rendering while preserving refresh/access-loss clearing and all schedule/inbox/request controls. daily-page.tsx stops fetching unused organization assignments; My patients remains the organization-context entry. Shared profile grid CSS is retained. Current direct-only service limits and author-scoped filtering remain unchanged. AGENTS, practitioner README, feature map and UI_GUIDE record the owner revision.

## Verification

- Five-file Vitest regression42/42 passed: practitioner-daily-ui/routing, practitioner-patients-ui, sharing-ui and professional-entry-ui. Checks include closed defaults, three-entry preview, deterministic activity ordering, independent toggles, due ordering across connections, explicit context links, empty states, clearing after failed current-access refresh, approval routing and existing daily operations. The first run found the obsolete dashboard-card assertion; replaced it with the new behavior checks.
- Full ESLint, TypeScript noEmit, production build including TypeScript, client-secret scan and whitespace check passed. Sandboxed build could not fetch the existing Manrope font; reviewed network-enabled build succeeded. No backend query/authorization/schema change required a new native integration suite.
- Production preview used a fresh disposable native PostgreSQL database and synthetic practitioner/patient fixtures, with provider auth/chat endpoints blocked. The first preview launch lacked Node's react-server condition; restarted with the correct condition. No hosted account, patient record or permission changed.
- Browser verified desktop1280x900 and mobile390x844. Document widths matched each viewport; mobile card width317.6px. Desktop blue-card bottom and white-drawer top both779.45px (zero gap), closed drawer78px, collapsed extra-activity height0. Actual computed gradient matches /health:145deg #68a4ff/#478bee/#2f74d8. Expanded activity max-height520px. Enter opened reminders without collapsing activities; Enter collapsed activities while reminders stayed open; Space closed reminders. Collapsed content is absent from the native accessibility tree. CSS reduced-motion override inspected; OS preference was not changed, so reduced-motion runtime behavior is not claimed browser-verified. Safari and full launch reviews remain outside this slice.
- Screenshots: evidence/practitioner-dashboard-2026-10-23/{desktop,mobile,mobile-top}.png. Synthetic preview stopped, temporary tab closed and viewport override reset after review.

## Handoff

Read today-dashboard.tsx and shared hero/daily CSS for bounded layout follow-ups. Keep activities separate from author-private reminders and preserve dedicated daily pages and explicit direct/organization contexts. Existing release gates and clinician document-upload gap are unchanged.
