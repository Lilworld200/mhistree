"use client";
import { useEffect, useState, useRef } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import type { ActingContext } from "@/features/access/server";
type Pending = {
  id: string;
  message_id: string;
  category: string;
  proposal: { body: { text: string; careDetails?: { certainty?: string } } };
  version: number;
  state: string;
};
type Status = {
  findings: Pending[];
  jobs: { id: string; state: string; issue: string | null }[];
};
export function InboxFindings({
  connectionId,
  context,
  onOpened,
  onDenied,
}: {
  connectionId: string;
  context: ActingContext;
  onOpened: () => void;
  onDenied?: () => void;
}) {
  const denied = useRef(onDenied);
  useEffect(() => {
    denied.current = onDenied;
  }, [onDenied]);
  const [status, setStatus] = useState<Status>({ findings: [], jobs: [] }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(context);
  useEffect(() => {
    let active = true,
      running = false;
    async function load() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const r = await api<Status>(
          `/api/care/inbox?connection=${connectionId}&context=${encodeURIComponent(key)}&view=analysis`,
        );
        if (!Array.isArray(r.findings) || !Array.isArray(r.jobs))
          throw new Error(
            "Inbox analysis is unavailable. Your messages are retained.",
          );
        if (active) {
          setStatus(r);
          setError("");
        }
      } catch (e) {
        if (active) {
          setStatus({ findings: [], jobs: [] });
          setError(errorMessage(e));
          if (
            e instanceof Error &&
            [
              "ACCESS_DENIED",
              "ACCESS_REVOKED",
              "AUTH_REQUIRED",
              "SESSION_RETIRED",
            ].includes(e.message)
          )
            denied.current?.();
        }
      } finally {
        running = false;
      }
    }
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connectionId, key, attempt]);
  async function act(action: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/care/inbox", { connectionId, context, action, data });
      if (
        action === "finding" &&
        (data as { action: string }).action === "review"
      )
        onOpened();
      setAttempt((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (
    !status.findings.length &&
    !status.jobs.some((j) =>
      ["failed", "partial", "paused"].includes(j.state),
    ) &&
    !error
  )
    return null;
  return (
    <section aria-label="Pending inbox findings">
      <h3>Findings from your inbox</h3>
      <p>
        Review before adding to the patient record or saving privately.
        Suspected findings remain suspected.
      </p>
      {status.findings.map((f) => (
        <article className="record-card" key={f.id}>
          <p>{f.proposal.body.text}</p>
          <small>
            {f.category} ·{" "}
            {f.proposal.body.careDetails?.certainty ?? "Review certainty"} ·{" "}
            {f.state}
          </small>
          <div className="qrow">
            <Btn
              disabled={busy}
              onClick={() =>
                void act("finding", {
                  id: f.id,
                  version: f.version,
                  action: "review",
                })
              }
            >
              Review findings
            </Btn>
            <Btn
              disabled={busy}
              onClick={() =>
                void act("finding", {
                  id: f.id,
                  version: f.version,
                  action: "dismiss",
                })
              }
            >
              Dismiss finding
            </Btn>
          </div>
        </article>
      ))}
      {status.findings.length === 50 && (
        <p>
          Showing the first 50 pending findings. Reviewing or dismissing them
          reveals further findings.
        </p>
      )}
      {status.jobs
        .filter((j) => ["failed", "partial", "paused"].includes(j.state))
        .map((j) => (
          <p key={j.id} role="status">
            {j.issue}
            <Btn
              disabled={busy}
              onClick={() => void act("analyze", { id: j.id })}
            >
              Retry analysis
            </Btn>
          </p>
        ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
