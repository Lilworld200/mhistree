"use client";

import { OverlayShell } from "@/components/ui/overlay-shell";
import { useShellStore } from "../store";

/** ChatGPT-style left navigation sheet (mobile only). */
export function NavDrawer({
  renderNav,
}: {
  renderNav: (onClose?: () => void) => React.ReactNode;
}) {
  const open = useShellStore((s) => s.drawerOpen);
  const setDrawerOpen = useShellStore((s) => s.setDrawerOpen);
  const close = () => setDrawerOpen(false);

  return (
    <OverlayShell
      variant="left"
      open={open}
      onClose={close}
      title="Navigation menu"
    >
      {renderNav(close)}
    </OverlayShell>
  );
}
