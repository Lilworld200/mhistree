"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark";

interface ShellState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  cmdOpen: boolean;
  setCmdOpen: (v: boolean) => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => set({ theme }),
      drawerOpen: false,
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      cmdOpen: false,
      setCmdOpen: (cmdOpen) => set({ cmdOpen }),
    }),
    {
      name: "mhistree.shell",
      partialize: (s) => ({ theme: s.theme }),
    },
  ),
);
