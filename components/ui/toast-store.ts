import { create } from "zustand";
import type { IconName } from "./icons";

export interface ToastItem {
  id: number;
  text: string;
  icon: IconName;
}

let seq = 0;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

interface ToastState {
  items: ToastItem[];
  push: (text: string, icon?: IconName) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  push(text, icon = "check") {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, text, icon }] }));
    timers.set(
      id,
      setTimeout(() => get().dismiss(id), 2800),
    );
  },
  dismiss(id) {
    const t = timers.get(id);
    if (t) {
      clearTimeout(t);
      timers.delete(id);
    }
    set((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  },
}));

/** Imperative helper usable from stores and event handlers. */
export function toast(text: string, icon: IconName = "check") {
  useToastStore.getState().push(text, icon);
}
