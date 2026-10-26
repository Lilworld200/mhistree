# UI reference: snapshot 71121bd

Owner selected this commit on 2026-10-16 as the design authority for existing patient pages. This is a repository memory/reference, not a promise of recall outside this project. Historical files were read using git show; no checkout/reset or old service/store import was performed. Existing preserved reference captures from 2c8c46c corroborate the shared chat shell, but are not claimed captures of 71121bd.

## Read-only source map

- app/globals.css: Soft-Float tokens, shell, page headings, cards, pills, bubbles, composer, hero, grids and mobile rules.
- features/shell/components/app-shell.tsx, patient-nav-content.tsx and config/navigation.ts: 288px sidebar, first five primary patient links, recent conversations and profile footer; mobile drawer.
- features/chat/components/chat-header.tsx, message-list.tsx, message-bubble.tsx, composer.tsx: compact header, centered welcome with three prompts, left AI/right user bubbles, bottom composer.
- features/timeline/components/timeline-view.tsx, event-card.tsx: two pill-filter rows, timeline rail, circular category icon, compact text and source/status badges, expandable evidence.
- features/health/components/health-view.tsx, health-hero.tsx, baseline-card.tsx: blue hero, action row and two-column card grid.
- features/documents/components/documents-view.tsx: page heading, upload action and responsive document grid.
- features/sharing/components/sharing-view.tsx: page heading and two-column access cards.
- features/profile/components/profile-hero.tsx/profile-view.tsx: blue profile hero and grouped details.
- features/settings/components/settings-view.tsx: grouped settings surface. Current /settings redirects to existing record controls; no speculative preference controls were reintroduced.

## CSS values read from the snapshot

Manrope; stage #f3f3f2, shell #ececeb, shell2 #f1f1f0, card #f6f6f5, ink #181818, secondary #6e6e6e. Blue hero gradient #68a4ff → #478bee → #2f74d8. Black gradient primary pills. Desktop stage: padding/gap 20px, columns 288px/remaining width; sidebar radius28, main32, cards24. Content padding28px32px. Hero radius28px28px42px42px. Card grids gap16px. Chat header padding18px26px, messages24px26px, composer16px22px; bubbles14px/1.55 with20px rounded corners and a6px directional corner. Button50px, small38px. At980px and below: drawer/topbar, stage padding/gap12px, single-column grids and content20px16px. These are source CSS values, not invented rendered measurements.

## Current implementation map and deliberate adaptations

components/layout/app-shell.tsx keeps the current server-authenticated shell and renders restored navigation/profile footer. chat-navigation.tsx coordinates existing conversation IDs with the sidebar, entirely in transient React state. Additional current care routes remain under an expandable Care and appointments group. No browser Supabase authentication/store was imported.

features/ai-chat/chat-view.tsx retains current APIs, idempotency, generation/cancellation, retries, evidence assessment and processing. Owner refinement2026-10-26 removes Conversation options and its entire menu, including the assessment entry point. At980px and below, hide the complete in-chat header and move the disabled notification bell into the existing shell mobile topbar action slot; desktop retains its heading/subtitle/bell. Report processing remains in its disclosure and sidebar/drawer chat selection/New chat remain available. Timestamps/timezone/gaps remain available. Unsupported microphone/notifications are disabled and labelled unavailable. Prompt buttons never submit invented symptoms.

features/health-records/timeline-view.tsx uses current server category/source filters and pagination. Compact cards expand to original evidence, attribution, timing, versions and retained correction controls. Badges use actual source/status fields; no old confidence scores or clinical confirmation is inferred.

features/health-records/health-view.tsx maps current medication/allergy/baseline/ongoing data to the hero/card layout. Prescriptions stay separate. No live-vitals claim, seeded upcoming care, fabricated counts or confirmed conditions were copied. Documents, sharing and profile reuse current upload, consent and account operations with the source layout. Shared patient page styles carry the design into current care/other pages; old unsupported functionality is not recreated.

## Verification

Browser checks run in a separate freshly migrated native PostgreSQL database with a synthetic session and intercepted fixture API responses. Hosted patient data and Supabase mail/auth were not used. References under reference/71121bd-restoration contain synthetic screens only. Captures/checks cover chat, timeline, health, documents, sharing and profile at1440x1000,390x844,1920x1080. Native evidence expansion/source and chat-send UI interactions are checked; intercepted replies prove UI wiring, not AI/backend/provider behavior. verification.json records document widths and page errors. Pixel-identical reproduction of every old state is not claimed.
