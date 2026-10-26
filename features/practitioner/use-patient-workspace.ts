"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import type { WorkspaceViewName } from "./workspace";

/** One request owner for the profile and active care panel. Never shares patient
 * snapshots across components/pages or reuses authority for a mutation. */
export function usePatientWorkspace<T extends { revision: number }>(
  connectionId: string,
  view: WorkspaceViewName,
  initialData: T | undefined,
  onRevisionChange: () => void,
) {
  const [data, setData] = useState<T | null>(initialData ?? null);
  const [error, setError] = useState("");
  const [loadedView, setLoadedView] = useState<WorkspaceViewName>("profile");
  const desired = useRef({ connectionId, view });
  desired.current = { connectionId, view };
  const revision = useRef(initialData?.revision),
    mounted = useRef(false),
    requested = useRef(false);
  const onRevision = useRef(onRevisionChange);
  onRevision.current = onRevisionChange;
  const running = useRef<{ target: string; promise: Promise<void> } | null>(
    null,
  );
  const clear = useCallback(() => {
    setData(null);
    onRevision.current();
  }, []);
  const refresh = useCallback(async function load(force = true): Promise<void> {
    const selected = desired.current,
      target = `${selected.connectionId}:${selected.view}`;
    if (running.current) {
      const again = force || running.current.target !== target;
      await running.current.promise;
      if (again && mounted.current) return load(false);
      return;
    }
    const promise = (async () => {
      requested.current = true;
      try {
        const result = await api<T>(
          `/api/practitioner/workspace?connection=${selected.connectionId}&view=${selected.view}`,
        );
        if (
          !mounted.current ||
          desired.current.connectionId !== selected.connectionId ||
          desired.current.view !== selected.view
        )
          return;
        if (
          revision.current !== undefined &&
          revision.current !== result.revision
        )
          onRevision.current();
        revision.current = result.revision;
        setData(result);
        setLoadedView(selected.view);
        setError("");
      } catch (e) {
        if (
          mounted.current &&
          desired.current.connectionId === selected.connectionId
        ) {
          setData(null);
          onRevision.current();
          setError(errorMessage(e));
        }
      }
    })();
    running.current = { target, promise };
    try {
      await promise;
    } finally {
      running.current = null;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!(initialData && !requested.current && view === "profile"))
      void refresh(false);
    const visibleRefresh = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    const timer = setInterval(visibleRefresh, 15000);
    window.addEventListener("focus", visibleRefresh);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", visibleRefresh);
    };
  }, [connectionId, view, initialData, refresh]);
  return { data, error, refresh, loadedView, clear };
}
