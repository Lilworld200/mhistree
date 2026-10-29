"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import { useCareNotifications } from "@/features/practitioner/notification-context";
import { Icon } from "@/components/ui/icons";
import type { ActingContext } from "@/features/access/server";
type Connection = {
  connectionId: string;
  name: string;
  context: ActingContext;
  participants?: { accountId: string; name: string }[];
  unread: number;
  latest_at?: string | null;
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
  const basePath = practitioner ? "/clinician/inbox" : "/inbox";
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [search, setSearch] = useState("");
  const routeKey = `${practitioner}:${initialConnection}:${initialContext}`;
  const [loadedRoute, setLoadedRoute] = useState("");
  const loading = loadedRoute !== routeKey;
  const messageList = useRef<HTMLDivElement>(null);
  const scrollState = useRef({ key: "", last: "" });
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
    ++epoch.current;
    let active = true;
    api<{ items: Connection[] }>(
      "/api/care/inbox" + (practitioner ? "?practitioner=1" : ""),
    )
      .then((r) => {
        if (active) {
          setConnections(r.items);
          setLoadedRoute(
            `${practitioner}:${initialConnection}:${initialContext}`,
          );
          const next =
            r.items.find(
              (c) =>
                c.connectionId === initialConnection &&
                (!initialContext ||
                  JSON.stringify(c.context) === initialContext),
            ) ?? null;
          setSelected(next);
          const key = next
            ? JSON.stringify(next.context) + next.connectionId
            : "";
          setText(drafts.current.get(key) ?? "");
          setThread(null);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setLoadedRoute(
            `${practitioner}:${initialConnection}:${initialContext}`,
          );
        }
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
  useEffect(() => {
    if (initialConnection) return;
    let alive = true,
      running = false;
    const refresh = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const result = await api<{ items: Connection[] }>(
          "/api/care/inbox" + (practitioner ? "?practitioner=1" : ""),
        );
        if (alive) {
          setConnections(result.items);
          setError("");
        }
      } catch (e) {
        if (alive) setError(errorMessage(e));
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void refresh(), 15000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [initialConnection, practitioner]);
  const visibleSelected =
    selected?.connectionId === initialConnection &&
    (!initialContext || JSON.stringify(selected.context) === initialContext)
      ? selected
      : null;
  useEffect(() => {
    const box = messageList.current;
    if (!box || !thread || !visibleSelected) {
      scrollState.current = { key: "", last: "" };
      return;
    }
    const last = thread.items.at(-1)?.id ?? "";
    const previous = scrollState.current;
    const nearBottom =
      box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (
      previous.key !== selectionKey ||
      (last !== previous.last && (nearBottom || thread.items.at(-1)?.own))
    )
      box.scrollTop = box.scrollHeight;
    scrollState.current = { key: selectionKey, last };
  }, [thread, selectionKey, visibleSelected]);
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
  const filtered = [...connections]
    .sort(
      (a, b) =>
        (Date.parse(b.latest_at ?? "") || 0) -
          (Date.parse(a.latest_at ?? "") || 0) || a.name.localeCompare(b.name),
    )
    .filter(
      (c) =>
        (filter === "all" ||
          (filter === "unread" ? c.unread > 0 : c.unread === 0)) &&
        c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    );
  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0])
      .join("");
  return (
    <section
      className={`patient-page care-inbox${initialConnection ? " care-inbox-chat" : ""}`}
    >
      {!initialConnection ? (
        <>
          <header className="phead">
            <div>
              <h1 className="ptitle">Care inbox</h1>
              <p className="psub">
                Your conversations with{" "}
                {practitioner ? "patients" : "your care team"}.
              </p>
            </div>
          </header>
          <div className="care-inbox-list-panel">
            <label className="care-inbox-search">
              <Icon n="search" s={20} />
              <span className="sr-only">Search conversations</span>
              <input
                type="search"
                placeholder={`Search ${practitioner ? "patients" : "practitioners"}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div
              className="care-inbox-filters"
              role="group"
              aria-label="Filter conversations"
            >
              {(["all", "unread", "read"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {value === "all"
                    ? "All"
                    : value === "unread"
                      ? "Unread"
                      : "Read"}
                  {value === "unread" &&
                    connections.some((c) => c.unread > 0) && (
                      <span>
                        {connections.filter((c) => c.unread > 0).length}
                      </span>
                    )}
                </button>
              ))}
            </div>
            {loading && (
              <p className="care-inbox-empty" role="status">
                Loading conversations...
              </p>
            )}
            {!loading && !filtered.length && (
              <div className="care-inbox-empty">
                <Icon n="chat" s={32} />
                <h2>
                  {connections.length
                    ? "No matching conversations"
                    : "No conversations yet"}
                </h2>
                <p>
                  {connections.length
                    ? "Try another name or filter."
                    : `Your eligible connected ${practitioner ? "patients" : "practitioners"} will appear here.`}
                </p>
              </div>
            )}
            <nav className="care-inbox-list" aria-label="Care conversations">
              {filtered.map((c) => (
                <Link
                  className="care-conversation"
                  key={JSON.stringify(c.context) + c.connectionId}
                  href={`${basePath}?connection=${encodeURIComponent(c.connectionId)}&context=${encodeURIComponent(JSON.stringify(c.context))}`}
                >
                  <span className="care-inbox-avatar" aria-hidden="true">
                    {initials(c.name)}
                  </span>
                  <span className="care-conversation-copy">
                    <strong>{c.name}</strong>
                    <span>
                      {c.unread > 0
                        ? `${c.unread} unread message${c.unread === 1 ? "" : "s"}`
                        : c.latest_at
                          ? "Open conversation"
                          : "Start a conversation"}
                    </span>
                  </span>
                  <span className="care-conversation-meta">
                    {c.latest_at && (
                      <time dateTime={c.latest_at}>
                        {new Date(c.latest_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                    )}
                    {c.unread > 0 ? (
                      <span
                        className="care-unread-count"
                        aria-label={`${c.unread} unread messages`}
                      >
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    ) : (
                      <Icon n="chevronRight" s={18} />
                    )}
                  </span>
                </Link>
              ))}
            </nav>
          </div>
        </>
      ) : (
        <>
          <header className="care-chat-header">
            <Link
              className="care-chat-back"
              href={basePath}
              aria-label="Back to care inbox"
            >
              <Icon n="arrowLeft" s={22} />
            </Link>
            {visibleSelected && (
              <>
                <span className="care-inbox-avatar" aria-hidden="true">
                  {initials(visibleSelected.name)}
                </span>
                <div className="care-chat-title">
                  <h1>{visibleSelected.name}</h1>
                  <p>
                    {visibleSelected.context.kind === "organization" ||
                    (visibleSelected.participants &&
                      visibleSelected.participants.length > 1)
                      ? "Care-team conversation"
                      : "Care conversation"}
                  </p>
                </div>
              </>
            )}
          </header>
          {!visibleSelected && (
            <p className="care-inbox-empty" role="status">
              {loading
                ? "Opening conversation..."
                : "This conversation is unavailable."}
            </p>
          )}
        </>
      )}
      {error && (
        <p className="care-inbox-error" role="alert">
          {error} Your unsent text is retained.
        </p>
      )}
      {visibleSelected && (
        <section
          className="care-chat-body"
          aria-label={`Conversation with ${visibleSelected.name}`}
        >
          {practitioner && (
            <Link
              className="care-chat-review"
              href={
                visibleSelected.context.kind === "organization"
                  ? `/organizations/record?connection=${visibleSelected.connectionId}&organization=${visibleSelected.context.organizationId}&assignment=${visibleSelected.context.assignmentId}#talk-to-mhistree`
                  : `/clinician/patients/${visibleSelected.connectionId}#talk-to-mhistree`
              }
            >
              Talk to Mhistree and review findings{" "}
              <Icon n="chevronRight" s={15} />
            </Link>
          )}
          <div
            className="care-chat-scroll"
            ref={messageList}
            tabIndex={0}
            aria-label="Message history"
          >
            {thread?.nextCursor && (
              <Btn
                disabled={busy}
                onClick={async () => {
                  const generation = epoch.current;
                  setBusy(true);
                  try {
                    const page = await api<Thread>(
                      `/api/care/inbox?connection=${visibleSelected.connectionId}&context=${encodeURIComponent(JSON.stringify(visibleSelected.context))}&before=${thread.nextCursor}`,
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
            <div
              className="inbox-messages care-chat-messages"
              aria-live="polite"
            >
              {thread?.items.map((m) => (
                <article
                  key={m.id}
                  className={`inbox-message care-chat-bubble${m.own ? " inbox-message-own" : ""}`}
                >
                  <small>
                    {m.own
                      ? "You"
                      : (visibleSelected.participants?.find(
                          (p) => p.accountId === m.author_account_id,
                        )?.name ??
                        (practitioner && m.author_role === "practitioner"
                          ? "Care-team practitioner"
                          : visibleSelected.name))}
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
                  <small>{new Date(m.sent_at).toLocaleString()} | Stored</small>
                </article>
              ))}
            </div>
            {!thread && (
              <p className="care-inbox-empty" role="status">
                Loading messages...
              </p>
            )}
            {thread && !thread.items.length && (
              <div className="care-inbox-empty">
                <Icon n="chat" s={32} />
                <h2>Start the conversation</h2>
                <p>Send your first message to {visibleSelected.name}.</p>
              </div>
            )}
            {thread?.items.some((m) => !m.own) ? (
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
          </div>
          <form
            className="care-chat-composer"
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
              <span className="sr-only">Message</span>
              <textarea
                placeholder="Type a message..."
                rows={2}
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
              <Icon n="up" s={20} />
              <span className="sr-only">
                {busy ? "Saving..." : "Send message"}
              </span>
            </Btn>
          </form>
          <details className="care-chat-info">
            <summary>About care messaging</summary>
            <p>
              Mhistree can identify health information in these messages.
              Practitioner findings require review before entering the health
              record. Stored delivery does not mean a message has been read.
            </p>
          </details>
        </section>
      )}
    </section>
  );
}
