"use client";

import { useEffect } from "react";
import { useShellStore } from "../store";

/**
 * Global keyboard shortcuts.
 * Escape handling for dialogs/sheets is owned by Radix Dialog itself;
 * this hook only adds the command-palette shortcut and a safety reset
 * for the mobile nav drawer.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const s = useShellStore.getState();
        s.setCmdOpen(!s.cmdOpen);
        if (!s.cmdOpen) s.setDrawerOpen(false);
      }
      if (e.key === "Escape") {
        useShellStore.getState().setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
