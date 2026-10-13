"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { OverlayShell } from "@/components/ui/overlay-shell";
import { useChatStore } from "@/features/chat/store";
import { useDocumentsStore } from "@/features/documents/store";
import { useSharingStore } from "@/features/sharing/store";
import { useShellStore } from "../store";

interface CommandItem {
  label: string;
  icon: IconName;
  run: () => void;
}

/** Cmd/Ctrl+K command palette. */
export function CommandMenu() {
  const router = useRouter();
  const open = useShellStore((s) => s.cmdOpen);
  const setCmdOpen = useShellStore((s) => s.setCmdOpen);
  const close = () => setCmdOpen(false);

  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);

  // Reset query/highlight each time the palette opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    setQ("");
    setHi(0);
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  const allItems: CommandItem[] = [
    {
      label: "New chat",
      icon: "plus",
      run: () => useChatStore.getState().newChat(),
    },
    {
      label: "Open timeline",
      icon: "pulse",
      run: () => router.push("/timeline"),
    },
    { label: "Open health", icon: "heart", run: () => router.push("/health") },
    {
      label: "Upload document",
      icon: "up",
      run: () => useDocumentsStore.getState().upload(),
    },
    {
      label: "Share health context",
      icon: "share",
      run: () => useSharingStore.getState().setWizardOpen(true),
    },
    {
      label: "Open settings",
      icon: "gear",
      run: () => router.push("/settings"),
    },
    {
      label: "Switch to clinician",
      icon: "steth",
      run: () => router.push("/clinician/dashboard"),
    },
  ];
  const items = allItems.filter((it) =>
    it.label.toLowerCase().includes(q.toLowerCase()),
  );

  const runAt = (i: number) => {
    const it = items[i];
    if (!it) return;
    close();
    it.run();
  };

  return (
    <OverlayShell
      variant="center"
      width={480}
      open={open}
      onClose={close}
      title="Command menu"
    >
      <div
        className="searchpill searchpill-big"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => (h + 1) % Math.max(items.length, 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => (h - 1 + items.length) % Math.max(items.length, 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            runAt(hi);
          }
        }}
      >
        <Icon n="search" s={16} />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setHi(0);
          }}
          placeholder="Type a command…"
          aria-label="Type a command"
        />
      </div>
      <div className="cmdlist">
        {items.map((it, i) => (
          <button
            key={it.label}
            className="nav-item"
            style={
              i === hi
                ? { background: "var(--card)", color: "var(--ink)" }
                : undefined
            }
            onMouseEnter={() => setHi(i)}
            onClick={() => runAt(i)}
          >
            <Icon n={it.icon} s={16} />
            {it.label}
          </button>
        ))}
        {items.length === 0 && (
          <p className="small" style={{ padding: "8px 14px" }}>
            No matching commands.
          </p>
        )}
      </div>
    </OverlayShell>
  );
}
