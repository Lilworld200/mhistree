"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Overview = {
  appointments: {
    id: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    state: string;
    version: number;
  }[];
  providers: {
    connection_id: string;
    practitioner_id: string;
    display_name: string;
    kind: string;
  }[];
  connections: {
    id: string;
    display_name: string;
    status: string;
    kind: string;
  }[];
  requests: {
    id: string;
    service_name: string;
    state: string;
    fixture: boolean;
    result_body: { text: string } | null;
    result_event_id: string | null;
  }[];
};
type Inbox = {
  items: {
    id: string;
    content: string;
    summary_attachment?: { text: string };
    clinical_attachments?: { eventId: string; text: string }[];
    sent_at: string;
    delivery_state: string;
    author_account_id: string;
  }[];
  nextCursor: string | null;
};
export function CareView({
  area,
}: {
  area: "appointments" | "inbox" | "requests";
}) {
  const [data, setData] = useState<Overview | null>(null),
    [connection, setConnection] = useState(""),
    [messages, setMessages] = useState<Inbox>({ items: [], nextCursor: null }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const operation = useRef<{ body: string; key: string } | null>(null);
  async function refresh() {
    setData(await api<Overview>("/api/care"));
  }
  useEffect(() => {
    void api<Overview>("/api/care")
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    let active = true;
    if (connection)
      void api<Inbox>(`/api/care?connection=${connection}`)
        .then((r) => {
          if (active) setMessages(r);
        })
        .catch((e) => {
          if (active) {
            setMessages({ items: [], nextCursor: null });
            setError(errorMessage(e));
          }
        });
    return () => {
      active = false;
    };
  }, [connection]);
  function key(body: unknown) {
    const text = JSON.stringify(body);
    if (operation.current?.body !== text)
      operation.current = { body: text, key: crypto.randomUUID() };
    return operation.current.key;
  }
  return (
    <section className="patient-page">
      <h1>
        {area === "appointments"
          ? "Appointments"
          : area === "inbox"
            ? "Care inbox"
            : "Requests and results"}
      </h1>
      <nav aria-label="Care sections">
        <Link href="/appointments">Appointments</Link> ·{" "}
        <Link href="/inbox">Care inbox</Link> ·{" "}
        <Link href="/requests">Requests and results</Link>
      </nav>
      <p className="muted">
        Provider producer screens are still being built. No live appointment
        acceptance or test fulfillment is implied by a pending request.
      </p>
      {area === "appointments" && (
        <>
          <p>
            Times use your device timezone when entered and retain the recorded
            timezone. Sending a request does not confirm a booking.
          </p>
          {!data?.providers.length ? (
            <p>
              No eligible connected practitioner is available for booking yet.
            </p>
          ) : (
            <form
              className="account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const f = new FormData(e.currentTarget);
                const provider = data.providers[Number(f.get("provider"))];
                const body = {
                  connectionId: provider.connection_id,
                  practitionerId: provider.practitioner_id,
                  slot: {
                    startsAt: new Date(String(f.get("starts"))).toISOString(),
                    endsAt: new Date(String(f.get("ends"))).toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
                };
                try {
                  await api("/api/care", {
                    action: "book",
                    data: { ...body, requestKey: key(body) },
                  });
                  operation.current = null;
                  setNotice(
                    "Appointment request saved. Awaiting provider response.",
                  );
                  await refresh();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Connected practitioner
                <select name="provider">
                  {data.providers.map((p, i) => (
                    <option
                      value={i}
                      key={`${p.connection_id}:${p.practitioner_id}`}
                    >
                      {p.display_name} · {p.kind}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start
                <input name="starts" type="datetime-local" required />
              </label>
              <label>
                End
                <input name="ends" type="datetime-local" required />
              </label>
              <Btn type="submit" disabled={busy}>
                Request appointment
              </Btn>
            </form>
          )}
          {data?.appointments.map((a) => (
            <article className="record-card" key={`${a.id}:${a.version}`}>
              <p>
                {new Date(a.starts_at).toLocaleString()} –{" "}
                {new Date(a.ends_at).toLocaleString()} · {a.timezone}
              </p>
              <strong>{a.state}</strong>
              {["requested", "accepted"].includes(a.state) && (
                <>
                  <Btn
                    disabled={busy}
                    onClick={async () => {
                      if (!window.confirm("Cancel this appointment?")) return;
                      setBusy(true);
                      try {
                        await api("/api/care", {
                          action: "appointment",
                          data: {
                            id: a.id,
                            version: a.version,
                            action: "cancel",
                          },
                        });
                        await refresh();
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Cancel
                  </Btn>
                  <details>
                    <summary>Reschedule</summary>
                    <form
                      className="account-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        setBusy(true);
                        try {
                          await api("/api/care", {
                            action: "appointment",
                            data: {
                              id: a.id,
                              version: a.version,
                              action: "reschedule",
                              slot: {
                                startsAt: new Date(
                                  String(f.get("starts")),
                                ).toISOString(),
                                endsAt: new Date(
                                  String(f.get("ends")),
                                ).toISOString(),
                                timezone:
                                  Intl.DateTimeFormat().resolvedOptions()
                                    .timeZone,
                              },
                            },
                          });
                          await refresh();
                        } catch (e) {
                          setError(errorMessage(e));
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label>
                        New start
                        <input name="starts" type="datetime-local" required />
                      </label>
                      <label>
                        New end
                        <input name="ends" type="datetime-local" required />
                      </label>
                      <Btn type="submit" disabled={busy}>
                        Request reschedule
                      </Btn>
                    </form>
                  </details>
                </>
              )}
            </article>
          ))}
        </>
      )}
      {area === "inbox" && (
        <>
          <p>
            Text messages to your care team. This is separate from AI chat.
            “Stored” confirms persistence, not that a clinician has read or
            acted on it.
          </p>
          <label>
            Connection
            <select
              value={connection}
              onChange={(e) => {
                setConnection(e.target.value);
                setMessages({ items: [], nextCursor: null });
              }}
            >
              <option value="">Select a connected care team</option>
              {data?.connections
                .filter((c) => c.status === "active")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name} · {c.kind}
                  </option>
                ))}
            </select>
          </label>
          {messages.nextCursor && (
            <Btn
              disabled={busy}
              onClick={async () => {
                try {
                  const page = await api<Inbox>(
                    `/api/care?connection=${connection}&before=${messages.nextCursor}`,
                  );
                  setMessages({
                    items: [...page.items, ...messages.items],
                    nextCursor: page.nextCursor,
                  });
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Earlier messages
            </Btn>
          )}
          {messages.items.map((m) => (
            <article className="record-card" key={m.id}>
              <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
              {m.summary_attachment && (
                <aside aria-label="Patient reviewed summary">
                  {m.summary_attachment.text}
                </aside>
              )}
              {m.clinical_attachments?.map((attachment) => (
                <aside key={attachment.eventId}>
                  <strong>Reviewed patient-record entry</strong>
                  <p>{attachment.text}</p>
                </aside>
              ))}
              <small>
                {new Date(m.sent_at).toLocaleString()} · {m.delivery_state} ·{" "}
                {m.author_account_id}
              </small>
            </article>
          ))}
          {connection && (
            <form
              className="account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                setBusy(true);
                const body = {
                  connectionId: connection,
                  content: f.get("content"),
                  replyToMessageId: messages.items.at(-1)?.id,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                };
                try {
                  await api("/api/care", {
                    action: "message",
                    data: { ...body, requestKey: key(body) },
                  });
                  operation.current = null;
                  form.reset();
                  setMessages(await api(`/api/care?connection=${connection}`));
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Message
                <textarea name="content" required maxLength={10000} rows={4} />
              </label>
              <Btn type="submit" disabled={busy}>
                Send message
              </Btn>
            </form>
          )}
        </>
      )}
      {area === "requests" && (
        <>
          {!data?.requests.length && (
            <p>
              No service requests or results yet. Provider request screens
              arrive in T23; nothing is fabricated here.
            </p>
          )}
          {data?.requests.map((r) => (
            <article className="record-card" key={r.id}>
              <h2>{r.service_name}</h2>
              <p>
                {r.state}
                {r.fixture
                  ? " · Synthetic contract fixture; not live care"
                  : ""}
              </p>
              {r.result_body && <p>{r.result_body.text}</p>}
              {r.result_event_id && (
                <Link href={`/timeline#event-${r.result_event_id}`}>
                  Result evidence and versions
                </Link>
              )}
            </article>
          ))}
        </>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
