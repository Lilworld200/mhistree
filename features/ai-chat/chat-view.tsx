"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { ExtractionStatus } from "./extraction/status-view";
type Message = {
  id: string;
  role: string;
  content: string;
  captured_at: string;
  timezone: string;
  state: string | null;
  sequence: string;
};
type History = { items: Message[]; nextCursor: string | null };
export function ChatView() {
  const [conversations, setConversations] = useState<
      { id: string; created_at: string }[]
    >([]),
    [selected, setSelected] = useState(""),
    [history, setHistory] = useState<History>({ items: [], nextCursor: null }),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [generating, setGenerating] = useState("");
  const request = useRef<{ key: string; text: string } | null>(null),
    locked = useRef(false),
    current = useRef("");
  async function load(id: string) {
    const result = await api<History>(`/api/chat?id=${id}`);
    if (current.current === id) setHistory(result);
  }
  useEffect(() => {
    void api<{ id: string; created_at: string }[]>("/api/chat")
      .then((items) => {
        setConversations(items);
        if (items[0]) {
          current.current = items[0].id;
          setSelected(items[0].id);
          void load(items[0].id).catch((e) => setError(errorMessage(e)));
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  async function generate(id: string, conversation: string) {
    setGenerating(id);
    setError("");
    try {
      await api("/api/chat", { action: "generate", data: { id } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerating("");
      await load(conversation).catch((e) => setError(errorMessage(e)));
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current || !text.trim()) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      let id = selected;
      if (!id) {
        id = crypto.randomUUID();
        await api("/api/chat", { action: "create", data: { id } });
        current.current = id;
        setSelected(id);
        setConversations(await api("/api/chat"));
      }
      if (!request.current || request.current.text !== text)
        request.current = { key: crypto.randomUUID(), text };
      const result = await api<{ messageId: string }>("/api/chat", {
        action: "send",
        data: {
          conversationId: id,
          requestKey: request.current.key,
          content: text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setText("");
      request.current = null;
      await load(id);
      const jobs =
        await api<{ id: string; message_id: string }[]>("/api/extraction");
      const job = jobs.find((j) => j.message_id === result.messageId);
      if (job) {
        try {
          await api("/api/extraction", { id: job.id });
        } catch (e) {
          setError(errorMessage(e));
        }
      }
      await generate(result.messageId, id);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <section className="patient-page chat-live">
      <header>
        <h1>Your health conversation</h1>
        <p className="muted">
          AI interpretation stays in chat. Clear reports are extracted into your
          record; processing gaps remain visible.
        </p>
        <div className="care-links">
          <Link href="/documents">Documents</Link> ·{" "}
          <Link href="/health">Health details</Link> ·{" "}
          <Link href="/sharing">Connections</Link> ·{" "}
          <Link href="/profile">Account</Link>
        </div>
        <label>
          Conversation{" "}
          <select
            value={selected}
            disabled={busy}
            onChange={(e) => {
              current.current = e.target.value;
              setSelected(e.target.value);
              void load(e.target.value).catch((e) => setError(errorMessage(e)));
            }}
          >
            <option value="">New conversation</option>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {new Date(c.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <Btn
          disabled={busy}
          onClick={() => {
            setSelected("");
            current.current = "";
            setHistory({ items: [], nextCursor: null });
          }}
        >
          New chat
        </Btn>
        <Btn
          disabled={busy || !selected}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/assessment", {
                conversationId: selected,
                requestKey: crypto.randomUUID(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
              await load(selected);
            }
          }}
        >
          Assess available evidence
        </Btn>
      </header>
      {history.nextCursor && (
        <Btn
          disabled={busy}
          onClick={async () => {
            try {
              const older = await api<History>(
                `/api/chat?id=${selected}&before=${history.nextCursor}`,
              );
              setHistory({
                items: [...older.items, ...history.items],
                nextCursor: older.nextCursor,
              });
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Earlier messages
        </Btn>
      )}
      <div className="chat-history" aria-label="Conversation history">
        {!history.items.length && (
          <div className="chat-welcome">
            <h2>A place for your health story</h2>
            <p>
              Share what happened, ask a question, or return to a previous
              conversation.
            </p>
          </div>
        )}
        {history.items.map((m, index) => (
          <article
            className={`record-card message-${m.role}`}
            key={m.id}
            id={`message-${m.id}`}
          >
            <strong>
              {m.role === "patient" ? "You" : "Mhistree AI · interpretation"}
            </strong>
            {index > 0 &&
              new Date(m.captured_at).getTime() -
                new Date(history.items[index - 1].captured_at).getTime() >
                3600000 && (
                <p className="muted">Conversation resumed after a gap</p>
              )}
            <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
            <small>
              {new Date(m.captured_at).toLocaleString()} · captured in{" "}
              {m.timezone}
            </small>
            {m.state && m.state !== "succeeded" && (
              <p>
                Reply: {m.state}{" "}
                {["failed", "queued", "running"].includes(m.state) && (
                  <Btn
                    disabled={Boolean(generating)}
                    onClick={() => void generate(m.id, selected)}
                  >
                    Retry reply
                  </Btn>
                )}
              </p>
            )}
          </article>
        ))}
      </div>
      {generating && (
        <div role="status">
          Generating reply…{" "}
          <Btn
            onClick={async () => {
              try {
                await api("/api/chat", {
                  action: "cancel",
                  data: { id: generating },
                });
                await load(selected);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Cancel reply
          </Btn>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <form onSubmit={send} className="account-form">
        <label>
          Your message
          <textarea
            name="message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={10000}
            rows={3}
            required
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </label>
        <Btn kind="dark" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send message"}
        </Btn>
      </form>
      <ExtractionStatus revision={history.items.length} />
    </section>
  );
}
