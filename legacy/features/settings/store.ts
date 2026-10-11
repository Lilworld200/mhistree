import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Prefs {
  style: string;
  lang: string;
  voice: boolean;
  notif: boolean;
  reminders: boolean;
  shareAlerts: boolean;
  personalMem: boolean;
  healthMem: boolean;
}

interface SettingsState {
  prefs: Prefs;
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      prefs: {
        style: "Concise",
        lang: "English",
        voice: true,
        notif: true,
        reminders: true,
        shareAlerts: true,
        personalMem: true,
        healthMem: true,
      },
      setPref: (key, value) =>
        set((s) => ({ prefs: { ...s.prefs, [key]: value } })),
    }),
    { name: "mhistree.prefs", partialize: (s) => ({ prefs: s.prefs }) },
  ),
);
