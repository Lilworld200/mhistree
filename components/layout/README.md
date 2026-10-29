# Application shell and scrolling

AppShell owns the authenticated desktop sidebar/main grid and mobile topbar/main grid (breakpoint980px). Only its app-viewport root owns viewport sizing. globals.css scopes html/body scroll containment with :has(.app-viewport), so public auth/registration pages retain normal scrolling without client-side body locking.

The stage fills its parent. Shrinkable minmax(0,1fr) tracks and zero minimum sizes prevent descendants from expanding the shell. Sidebar and main card use their allocated heights. Navigation lists, message history, long page sections and dialog bodies own overflow-y:auto plus overscroll containment. The page wrapper provides an internal fallback for route/error content. Chat headers/composers do not shrink. The Care Inbox history has no minimum height that displaces its composer in small viewports.

use-app-viewport.ts updates only the app root CSS height variable from unzoomed VisualViewport resize events, bounded by innerHeight. Pinch zoom uses the CSS100dvh fallback. Listeners/styles are removed on unmount. Root viewport metadata requests interactive-widget=resizes-content where supported; physical mobile keyboard behavior still needs device verification.

Navigation and AI message history can receive keyboard focus. Drawer navigation remains internally scrollable with Radix focus trapping/return. Tests: tests/app-viewport.test.ts for visible-height changes, keyboard dismissal, zoom fallback and cleanup. Synthetic actual-AppShell browser evidence and current limitations: ../../docs/tasks/viewport-containment-2026-10-29.md.
