"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { api } from "@/lib/client-api";
type Snapshot = {
  connections: { connectionId: string; unread: number }[];
  limited: boolean;
};
const empty: Snapshot = { connections: [], limited: false };
const Context = createContext({
  snapshot: empty,
  ready: false,
  refresh: async () => {},
});
export function useCareNotifications() {
  return useContext(Context);
}
export function CareNotificationProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children?: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(empty);
  const [ready, setReady] = useState(false);
  const running = useRef<Promise<void> | null>(null),
    mounted = useRef(false);
  const refresh = useCallback(async function load(force = true): Promise<void> {
    if (running.current) {
      await running.current;
      if (force && mounted.current) return load(false);
      return;
    }
    const promise = (async () => {
      try {
        const result = await api<Snapshot>("/api/practitioner/notifications");
        if (mounted.current) {
          setSnapshot(result);
          setReady(true);
        }
      } catch {
        if (mounted.current) {
          setSnapshot(empty);
          setReady(true);
        }
      }
    })();
    running.current = promise;
    try {
      await promise;
    } finally {
      running.current = null;
    }
  }, []);
  useEffect(() => {
    mounted.current = enabled;
    if (!enabled) return;
    void refresh(false);
    const update = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    const timer = setInterval(update, 15000);
    window.addEventListener("focus", update);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [enabled, refresh]);
  return (
    <Context.Provider
      value={{
        snapshot: enabled ? snapshot : empty,
        ready: enabled && ready,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
