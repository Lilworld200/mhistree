"use client";
import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import type { ActingContext } from "@/features/access/server";
import type { PractitionerReply } from "@/features/clinical-care/ai-proposal";
import {
  PractitionerReviewCard,
  type ReviewVersion,
  type ReviewEdits,
  type PendingPractitionerDraft,
} from "@/features/clinical-care/practitioner-review-card";
type Turn = PractitionerReply & { question: string };
type Page = {
  items: Turn[];
  nextCursor: string | null;
  pendingDraft?: PendingPractitionerDraft | null;
};
export type TalkAssistantProps = {
  connectionId: string;
  organizationContext?: ActingContext;
  summary?: boolean;
  writableCategories?: string[];
  onSaved?: () => void;
  onDenied?: () => void;
  initialQuestion?: string;
};

export function TalkAssistant({
  connectionId,
  organizationContext,
  summary = false,
  writableCategories = [],
  onSaved,
  onDenied,
  initialQuestion = "",
}: TalkAssistantProps) {
  const endpoint = organizationContext
    ? "/api/organizations/workspace"
    : "/api/practitioner/workspace";
  const contextKey = JSON.stringify(
    organizationContext ?? { kind: "direct", connectionId },
  );
  const binding = organizationContext
    ? { context: organizationContext }
    : { connectionId };
  const [page, setPage] = useState<Page>({ items: [], nextCursor: null }),
    [question, setQuestion] = useState(initialQuestion),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [version, setVersion] = useState<ReviewVersion | null>(null);
  const [ready, setReady] = useState(false),
    [loadAttempt, setLoadAttempt] = useState(0);
  const lock = useRef(false),
    epoch = useRef(0),
    denied = useRef(onDenied);
  useEffect(() => {
    denied.current = onDenied;
  }, [onDenied]);
  const query = organizationContext
    ? `context=${encodeURIComponent(contextKey)}`
    : `connection=${connectionId}`;
  function fail(e: unknown) {
    setError(errorMessage(e));
    if (
      e instanceof Error &&
      [
        "ACCESS_DENIED",
        "ACCESS_REVOKED",
        "AUTH_REQUIRED",
        "SESSION_RETIRED",
      ].includes(e.message)
    ) {
      setReady(false);
      setPage({ items: [], nextCursor: null });
      setVersion(null);
      denied.current?.();
    }
  }
  useEffect(() => {
    let current = true;
    epoch.current++;
    const lifecycle = epoch;
    api<Page>(`${endpoint}?${query}&view=ai-chat`)
      .then((data) => {
        if (current) {
          setReady(true);
          setPage(data);
          setVersion(data.pendingDraft?.version ?? null);
        }
      })
      .catch((e) => {
        if (current) {
          setReady(false);
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
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
      lifecycle.current++;
    };
  }, [endpoint, query, loadAttempt]);
  async function older() {
    const generation = epoch.current;
    setBusy(true);
    try {
      const result = await api<Page>(
        `${endpoint}?${query}&view=ai-chat&cursor=${encodeURIComponent(page.nextCursor!)}`,
      );
      if (generation === epoch.current)
        setPage((old) => ({
          items: [...result.items, ...old.items],
          nextCursor: result.nextCursor,
        }));
    } catch (e) {
      if (generation === epoch.current) fail(e);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!version || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      const turn = await api<Turn>(endpoint, {
        ...binding,
        action: "ai-review-confirm",
        data: { reviewId: version.id, reviewed: true },
      });
      if (generation !== epoch.current) return;
      setPage((old) => ({
        ...old,
        items: [...old.items.map((t) => ({ ...t, proposals: [] })), turn],
      }));
      setVersion(null);
      setQuestion("");
      onSaved?.();
    } catch (e) {
      if (generation === epoch.current) fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function send(text: string, purpose = "question") {
    if (lock.current || !ready || loading || !text.trim()) return;
    if (
      version &&
      /^(?:ok(?:ay)?|yes|yes please|send|send it|confirm)[.!\s]*$/i.test(
        text.trim(),
      )
    ) {
      await confirm();
      return;
    }
    setVersion(null);
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      const response = await api<PractitionerReply>(endpoint, {
        ...binding,
        action: "ai",
        data: {
          question: text,
          purpose,
          conversation: true,
          includeOwnNotes: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(page.items.at(-1)
            ? { previousRunId: page.items.at(-1)!.id }
            : {}),
        },
      });
      if (generation !== epoch.current) return;
      setPage((old) => ({
        ...old,
        items: [...old.items, { question: text, ...response }],
      }));
      setQuestion("");
    } catch (e) {
      if (generation === epoch.current) fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function prepare(runId: string, edits: ReviewEdits) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      const prepared = await api<ReviewVersion>(endpoint, {
        ...binding,
        action: "ai-review",
        data: { runId, ...edits },
      });
      if (generation === epoch.current) setVersion(prepared);
    } catch (e) {
      if (generation === epoch.current) fail(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="patient-assistant" aria-label="Talk to Mhistree">
      <p className="sharing-help">
        {writableCategories.length
          ? "Discuss this patient’s care. Review and edit suggested findings before sending them as your message and saving them. You can also continue by typing."
          : "Read-only assistance: ask about this patient’s currently shared records."}
      </p>
      {loading ? <p role="status">Loading your conversation…</p> : null}
      {error && <p role="alert">{error} Your unsent input is retained.</p>}
      {!loading && error && !page.items.length && (
        <Btn
          onClick={() => {
            setLoading(true);
            setError("");
            setLoadAttempt((old) => old + 1);
          }}
        >
          Reload conversation
        </Btn>
      )}
      {page.nextCursor && (
        <Btn disabled={busy} onClick={() => void older()}>
          Load earlier messages
        </Btn>
      )}
      {summary && (
        <Btn
          disabled={busy || loading || !ready}
          onClick={() =>
            void send(
              "Summarize this patient's authorized history and persistent health details. Preserve dates and uncertainty, and distinguish prescriptions from actual medication use.",
              "summary",
            )
          }
        >
          Generate AI summary
        </Btn>
      )}
      <div className="patient-assistant-turns" aria-live="polite">
        {page.items.map((turn, index) => (
          <div key={turn.id}>
            <p
              className="patient-ai-question"
              style={{ whiteSpace: "pre-wrap" }}
            >
              <small>You</small>
              <br />
              {turn.question}
            </p>
            <article className="patient-ai-response">
              <small>Mhistree · AI assistance</small>
              <p>{turn.text}</p>
              {turn.limitations.map((l, i) => (
                <p className="sharing-help" key={i}>
                  {l}
                </p>
              ))}
              <details>
                <summary>{turn.evidenceIds.length} supporting records</summary>
                <p>
                  These references belong to this historical response. Review
                  the current authorized record before making care decisions.
                </p>
              </details>
            </article>
            {index === page.items.length - 1 &&
              turn.proposals?.some((p) =>
                writableCategories.includes(p.category),
              ) && (
                <PractitionerReviewCard
                  key={turn.id}
                  proposals={turn.proposals.filter((p) =>
                    writableCategories.includes(p.category),
                  )}
                  busy={busy}
                  version={version}
                  initialDraft={
                    page.pendingDraft?.runId === turn.id
                      ? page.pendingDraft
                      : null
                  }
                  onChange={() => setVersion(null)}
                  onPrepare={(edits) => void prepare(turn.id, edits)}
                  onConfirm={() => void confirm()}
                />
              )}
          </div>
        ))}
      </div>
      <form
        className="patient-ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(question);
        }}
      >
        <label className="sr-only" htmlFor="patient-ai-question">
          Ask about this patient or describe care
        </label>
        <textarea
          id="patient-ai-question"
          value={question}
          maxLength={3000}
          required
          disabled={busy || loading || !ready}
          placeholder="Ask a question or describe care…"
          onChange={(e) => {
            setQuestion(e.target.value);
            if (
              version &&
              ![
                "okay",
                "ok",
                "yes",
                "yes please",
                "send",
                "send it",
                "confirm",
              ].some((word) =>
                word.startsWith(
                  e.target.value
                    .trim()
                    .toLowerCase()
                    .replace(/[.!]+$/, ""),
                ),
              )
            )
              setVersion(null);
          }}
        />
        <Btn
          kind="dark"
          type="submit"
          disabled={busy || loading || !ready || !question.trim()}
        >
          {busy ? "Working…" : "Send"}
        </Btn>
      </form>
    </section>
  );
}
