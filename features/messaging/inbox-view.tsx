"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import { useCareNotifications } from "@/features/practitioner/notification-context";
import { NotificationDot } from "@/components/ui/notification-dot";
import type { ActingContext } from "@/features/access/server";
type Connection = {
  connectionId: string;
  name: string;
  context: ActingContext;
  participants?: { accountId: string; name: string }[];
  unread: number;
};
type Job = { id: string; state: string; issue: string | null };
type Thread = {
  items: {
    id: string;
    content: string;
    own: boolean;
    author_role?: string;
    author_account_id?: string;
    recommendations?: {
      id: string;
      name: string;
      state: string;
      version: number;
    }[];
    sequence: string;
    sent_at: string;
    summary_attachment?: { text: string } | null;
  }[];
  nextCursor: string | null;
  analysis: { jobs: Job[] };
};
export function InboxView({
  practitioner = false,
  initialConnection = "",
  initialContext = "",
}: {
  practitioner?: boolean;
  initialConnection?: string;
  initialContext?: string;
}) {
  const { refresh: refreshNotifications } = useCareNotifications();
  const drafts = useRef(new Map<string, string>());
  const [connections, setConnections] = useState<Connection[]>([]),
    [selected, setSelected] = useState<Connection | null>(null),
    [thread, setThread] = useState<Thread | null>(null),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operation = useRef<{
      text: string;
      connection: string;
      key: string;
    } | null>(null),
    epoch = useRef(0),
    lock = useRef(false);
  const selectionKey = selected
    ? JSON.stringify(selected.context) + selected.connectionId
    : "";
  useEffect(() => {
    let active = true;
    api<{ items: Connection[] }>(
      "/api/care/inbox" + (practitioner ? "?practitioner=1" : ""),
    )
      .then((r) => {
        if (active) {
          setConnections(r.items);
          setSelected(
            r.items.find(
              (c) =>
                c.connectionId === initialConnection &&
                (!initialContext ||
                  JSON.stringify(c.context) === initialContext),
            ) ?? null,
          );
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [practitioner, initialConnection, initialContext]);
  useEffect(() => {
    const generation = ++epoch.current;
    if (!selected) return;
    let running = false,
      alive = true;
    const refresh = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const page = await api<Thread>(
          `/api/care/inbox?connection=${selected.connectionId}&context=${encodeURIComponent(JSON.stringify(selected.context))}`,
        );
        if (alive && epoch.current === generation) {
          setThread((old) =>
            old && old.items.length > 50
              ? {
                  ...page,
                  items: [
                    ...old.items.filter(
                      (m) =>
                        BigInt(m.sequence) <
                        BigInt(page.items[0]?.sequence ?? "0"),
                    ),
                    ...page.items,
                  ],
                  nextCursor: old.nextCursor,
                }
              : page,
          );
          setError("");
        }
      } catch (e) {
        if (alive && epoch.current === generation) {
          setThread(null);
          setError(errorMessage(e));
        }
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [selectionKey, selected]);
  async function action(action: string, data: unknown) {
    if (!selected || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const generation = epoch.current;
    try {
      await api("/api/care/inbox", {
        connectionId: selected.connectionId,
        context: selected.context,
        action,
        data,
      });
      if (generation !== epoch.current) return;
      if (action === "send") {
        operation.current = null;
        drafts.current.delete(selectionKey);
        setText("");
      }
      if (action === "read") await refreshNotifications();
      if (action === "read")
        setConnections((old) =>
          old.map((c) => (c === selected ? { ...c, unread: 0 } : c)),
        );
      const page = await api<Thread>(
        `/api/care/inbox?connection=${selected.connectionId}&context=${encodeURIComponent(JSON.stringify(selected.context))}`,
      );
      if (generation === epoch.current) setThread(page);
    } catch (e) {
      if (generation === epoch.current) setError(errorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="patient-page sharing-page">
      <header className="phead">
        <div>
          <h1 className="ptitle">Care inbox</h1>
          <p className="psub">
            Message your {practitioner ? "patients" : "care team"} directly.
          </p>
        </div>
      </header>
      <p className="sharing-help">
        Mhistree can identify health information in these messages. Practitioner
        findings require review before entering the health record. Stored
        delivery does not mean a message has been read.
      </p>
      {error && <p role="alert">{error} Your unsent text is retained.</p>}
      <nav className="sharing-tabs" aria-label="Care conversations">
        {connections.map((c) => (
          <Btn
            key={JSON.stringify(c.context) + c.connectionId}
            disabled={busy}
            style={{ whiteSpace: "normal", maxWidth: "100%" }}
            onClick={() => {
              setSelected(c);
              setThread(null);
              setText(
                drafts.current.get(
                  JSON.stringify(c.context) + c.connectionId,
                ) ?? "",
              );
              setError("");
            }}
          >
            {c.name}
            {c.unread > 0 && <NotificationDot />}
          </Btn>
        ))}
      </nav>
      {!connections.length && (
        <p>No eligible care conversations are available.</p>
      )}
      {selected && (
        <section
          className="card daily-section"
          aria-label={`Conversation with ${selected.name}`}
        >
          <h2>{selected.name}</h2>
          {practitioner && (
            <Link
              href={
                selected.context.kind === "organization"
                  ? `/organizations/record?connection=${selected.connectionId}&organization=${selected.context.organizationId}&assignment=${selected.context.assignmentId}#talk-to-mhistree`
                  : `/clinician/patients/${selected.connectionId}#talk-to-mhistree`
              }
            >
              Talk to Mhistree and review findings
            </Link>
          )}
          {thread?.nextCursor && (
            <Btn
              disabled={busy}
              onClick={async () => {
                const generation = epoch.current;
                setBusy(true);
                try {
                  const page = await api<Thread>(
                    `/api/care/inbox?connection=${selected.connectionId}&context=${encodeURIComponent(JSON.stringify(selected.context))}&before=${thread.nextCursor}`,
                  );
                  if (generation === epoch.current)
                    setThread((old) =>
                      old
                        ? { ...page, items: [...page.items, ...old.items] }
                        : page,
                    );
                } catch (e) {
                  if (generation === epoch.current) setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Earlier messages
            </Btn>
          )}
          <div className="inbox-messages" aria-live="polite">
            {thread?.items.map((m) => (
              <article
                key={m.id}
                className={`record-card inbox-message${m.own ? " inbox-message-own" : ""}`}
              >
                <small>
                  {m.own
                    ? "You"
                    : (selected.participants?.find(
                        (p) => p.accountId === m.author_account_id,
                      )?.name ??
                      (practitioner && m.author_role === "practitioner"
                        ? "Care-team practitioner"
                        : selected.name))}
                </small>
                <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
                {practitioner &&
                  m.own &&
                  m.recommendations
                    ?.filter((r) => ["pending", "planned"].includes(r.state))
                    .map((r) => (
                      <Btn
                        key={r.id}
                        disabled={busy}
                        onClick={() =>
                          void action("withdraw", {
                            id: r.id,
                            version: r.version,
                          })
                        }
                      >
                        Withdraw {r.name} initiation follow-ups
                      </Btn>
                    ))}
                {m.summary_attachment && (
                  <aside aria-label="Patient reviewed health summary">
                    <strong>Patient reviewed health summary</strong>
                    <p>{m.summary_attachment.text}</p>
                  </aside>
                )}
                <small>{new Date(m.sent_at).toLocaleString()} · Stored</small>
              </article>
            ))}
          </div>
          {thread?.items.length ? (
            <Btn
              disabled={busy}
              onClick={() =>
                void action("read", {
                  throughSequence: thread.items.at(-1)!.sequence,
                })
              }
            >
              Mark displayed messages read
            </Btn>
          ) : null}
          {thread?.analysis.jobs
            .filter((j) => ["failed", "partial", "paused"].includes(j.state))
            .map((j) => (
              <p key={j.id} role="status">
                {j.issue}
                <Btn
                  disabled={busy}
                  onClick={() => void action("analyze", { id: j.id })}
                >
                  Retry analysis
                </Btn>
              </p>
            ))}
          <form
            className="account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              if (
                !operation.current ||
                operation.current.text !== text ||
                operation.current.connection !== selectionKey
              )
                operation.current = {
                  text,
                  connection: selectionKey,
                  key: crypto.randomUUID(),
                };
              void action("send", {
                content: text,
                requestKey: operation.current.key,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                replyToMessageId: thread?.items.at(-1)?.id,
              });
            }}
          >
            <label>
              Message
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  drafts.current.set(selectionKey, e.target.value);
                }}
                required
                maxLength={10000}
                disabled={busy}
              />
            </label>
            <Btn
              type="submit"
              kind="dark"
              disabled={busy || !thread || !text.trim()}
            >
              {busy ? "Saving…" : "Send message"}
            </Btn>
          </form>
        </section>
      )}
    </section>
  );
}
