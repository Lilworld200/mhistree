"use client";

import { useEffect } from "react";
import { useShellStore } from "@/features/shell/store";

/**
 * Syncs the shell theme onto <html data-theme> for the whole app.
 * Lives in the root layout so standalone routes (e.g. /auth) that
 * never mount AppShell still resolve [data-theme="dark"] styles,
 * including Radix portals rendered at body level.
 */
export function ThemeProvider() {
  const theme = useShellStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  return null;
}
