# Existing component catalog

Source paths are current, not target ownership. Global class definitions live in `app/globals.css`. Props below describe reusable interfaces; inspect the source before adapting. Rendered coverage is guest chat/auth/navigation only unless stated. No component is certified accessible by inclusion here.

| Source | Purpose, API/variants and example use | States/layout/accessibility and disposition |
| --- | --- | --- |
| `features/shell/components/app-shell.tsx` | AppShell(renderNav, children), common patient/provider chrome | Stage/sidebar/main/page; responsive nav. Adapt into planned components/layout. Route motion lacks verified reduced variant. |
| `features/shell/components/mobile-topbar.tsx`, `nav-drawer.tsx` | Mobile navigation using shell store and renderNav | ≤980, left drawer, close/new chat. Open focus observed; Escape closes; return focus unresolved. |
| `components/ui/button.tsx` | Btn(kind soft/dark, sm, icon, asChild); IconBtn(icon,size46,ghost,title) | Default/disabled/focus/active; pill/circle. Accessible name through title; loading state must be added by caller. Guide has exact specimen. |
| `components/ui/overlay-shell.tsx` | OverlayShell(open,onClose,title,variant center/right/left,width,children) | Radix dialog + motion; width min(width,94vw); scrim and hidden title. Authoritative focus/reduced-motion testing still needed. |
| `components/ui/prompt-dialog.tsx`, `auth-modal.tsx` | PromptDialog primary/secondary/dismiss, width420; auth uses460 | Confirmation/unauthorized; close36 needs mobile hit-area repair. Hidden and visible headings duplicate. |
| `components/ui/avatar.tsx` | Avatar(img,ring,size44,name) | Circle, object-fit cover; initial fallback delay300 with image; alt=name. Preserve stable dimensions; synthetic initials when no licensed image. |
| `components/ui/badge.tsx` | ProvBadge(src), StatusBadge(st) | Dot+text, not color only. Patient blue #478BEE, device purple #8A63D2, lab green #2F8F5B, clinician #181818, AI amber #C08A2D. Dark contrast and desired source meanings need review. |
| `components/ui/fact-row.tsx` | FactRow(k,v,src), KvRow(k,v), MiniRow(onClick), RowIcon(icon,color,bg,sm) | Flexible compact rows; MiniRow uses button when actionable. Long-value truncation must expose full meaning. |
| `components/ui/area-sparkline.tsx` | AreaSparkline(data,gradientId,height74,color #478BEE) | Monotone Recharts area stroke2.4, opacity.35→0; unique gradient ID. Add textual units/trend/data alternative; seed numbers are not records. |
| `components/ui/markdown-renderer.tsx` | Chat formatted content | Retain sanitization; test malicious markdown/links, long code, accessible headings. Rendered rich content not exercised. |
| `components/ui/toast.tsx`, `toast-store.ts` | Shared notification presentation/store | Verify polite announcements and recovery. A toast cannot prove persistence or revocation. |
| `components/ui/switch.tsx`, `label.tsx` | Form primitives | Inspect actual control props at adaptation; keyboard/name/hit-area and theme checks pending. |
| `components/ui/reveal.tsx`, `typewriter.tsx`, `countdown.tsx` | Motion and time presentation | Preserve only needed effects; reduced-motion and capture-vs-event timing apply. Countdown is not consent enforcement. |
| `components/ui/qr-code.tsx` | QR presentation | Visual-only candidate. No access PIN/card feature added; never equate scanned locator to authority. |
| `features/chat/components/{chat-view,chat-header,composer,message-list,message-bubble}.tsx` | Guest hero, context header, input, messages | Empty state captured; messages/retry/streaming/dense states source-only. Adapt into ai-chat/patient. Input14 and stream durability need repair. |
| `features/timeline/components/{timeline-view,event-card,episode-card,evidence-drawer,correction-dialog}.tsx` | Timeline groups, evidence and correction overlays | Preserve hierarchy, replace local correction authority and add pagination/time precision. Authenticated visuals pending. |
| `features/documents/components/{documents-view,document-card,document-viewer-drawer}.tsx` | Upload/library/detail patterns | Preserve cards, implement durable pending/partial/failure and authorized original delivery; mock receipt not reusable behavior. |
| `features/health/components/`, `features/profile/components/` | Hero, vitals, baseline, recent/upcoming, profile tabs | Source-only dense cards; compose minimal real projections, never seed patient facts. |
| `features/sharing/components/` | Cards, wizard, history, drawer | Visual patterns only; replace lease model with independent direct/org consent and revocation. |
| `features/clinician/components/` | Dashboard, briefing, action console, record tabs, mobile toolbar | Source-only provider reference; synthetic/authenticated screenshots pending. Keep individual attribution/context visible. |

For each adopted primitive in T06 add a synthetic state specimen (default/focus/disabled/error/loading/long-content) and cite the matching reference. For each feature screen cite reused primitives and compare desktop/mobile; dense clinical screens need authenticated synthetic data, never a bypassed guard. Newly introduced components must follow measured tokens rather than copying unrelated prototype behavior.
