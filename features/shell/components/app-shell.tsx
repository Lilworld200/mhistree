"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";
import React, { useEffect } from "react";
import { EASE } from "@/components/ui/overlay-shell";
import { NavDrawer } from "./nav-drawer";
import { useGlobalShortcuts } from "../hooks/use-global-shortcuts";
import { MobileTopBar } from "./mobile-topbar";
import { useShellStore } from "../store";

/**
 * Role-agnostic application chrome. The route-group layout decides which
 * navigation content to render; everything else (stage grid, page
 * transitions, drawers, overlays) is shared.
 */
export function AppShell({
  renderNav,
  children,
}: {
  renderNav: (onClose?: () => void) => React.ReactNode;
  children: React.ReactNode;
}) {
  const theme = useShellStore((s) => s.theme);
  const pathname = usePathname();
  useGlobalShortcuts();

  // Theme tokens must live on <html> so Radix portals (body-level)
  // resolve the same custom properties as in-app content.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  return (
    <div className="app" data-theme={theme}>
      <div className="stage">
        <MobileTopBar />
        <aside className="side">{renderNav()}</aside>
        <main className="main-shell">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              className="page"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.26, ease: EASE }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <NavDrawer renderNav={renderNav} />
    </div>
  );
}
