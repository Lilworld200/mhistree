"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client-api";
import { ConsentPanel, HistoryPanel } from "./sharing-panels";
import {
  categoryLabels,
  dateLabel,
  type Connection,
  type Controls,
  type Practitioner,
} from "./sharing-types";

function Identity({
  name,
  organization = false,
}: {
  name: string;
  organization?: boolean;
}) {
  return (
    <span className="sharing-avatar" aria-hidden="true">
      {organization ? (
        <Icon n="cross" s={22} />
      ) : (
        name
          .split(/\s+/)
          .slice(0, 2)
          .map((n) => n[0])
          .join("")
          .toUpperCase()
      )}
    </span>
  );
}
function ConnectionCard({
  connection,
  onManage,
  onHistory,
}: {
  connection: Connection;
  onManage: (event: React.MouseEvent<HTMLElement>) => void;
  onHistory: (event: React.MouseEvent<HTMLElement>) => void;
}) {
  const permitted =
    connection.categories?.filter((c) => !connection.exclusions?.includes(c)) ??
    [];
  return (
    <article className="card sharing-connection">
      <div className="sharing-person">
        <Identity
          name={connection.display_name}
          organization={connection.kind === "organization"}
        />
        <div>
          <h3>{connection.display_name}</h3>
          <p>
            {connection.kind === "organization"
              ? "Organization"
              : "Direct practitioner"}
          </p>
        </div>
        <span className={`badge sharing-status ${connection.status}`}>
          {connection.status === "active"
            ? "Connected"
            : connection.status === "pending"
              ? "Awaiting approval"
              : "Access ended"}
        </span>
      </div>
      <div className="sharing-scope">
        {permitted.length ? (
          permitted.map((c) => <span key={c}>{categoryLabels[c] ?? c}</span>)
        ) : (
          <span>No categories shared</span>
        )}
      </div>
      <div className="sharing-card-actions">
        <Btn sm onClick={onManage}>
          {connection.status === "pending"
            ? "Review request"
            : connection.status === "revoked"
              ? "Review reconnection"
              : "Manage access"}
        </Btn>
        <button className="sharing-text-action" onClick={onHistory}>
          <Icon n="clock" s={16} />
          Access history
        </button>
      </div>
    </article>
  );
}

export function PatientControlsView() {
  const [data, setData] = useState<Controls | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"connections" | "requests" | "ended">(
    "connections",
  );
  const [selection, setSelection] = useState<{
    connection?: Connection;
    practitioner?: Practitioner;
  } | null>(null);
  const [history, setHistory] = useState<{ connection?: Connection } | null>(
    null,
  );
  const [search, setSearch] = useState<{
      items: Practitioner[];
      hasMore: boolean;
    } | null>(null),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [query, setQuery] = useState(""),
    [reviewBusy, setReviewBusy] = useState(false);
  async function refresh() {
    const next = await api<Controls>("/api/connections");
    setData(next);
    setError("");
  }
  useEffect(() => {
    let current = true;
    void api<Controls>("/api/connections")
      .then((next) => {
        if (current) setData(next);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      });
    return () => {
      current = false;
    };
  }, []);
  function markReturn(event: React.MouseEvent<HTMLElement>) {
    document
      .querySelector('[data-sharing-return="true"]')
      ?.removeAttribute("data-sharing-return");
    event.currentTarget.setAttribute("data-sharing-return", "true");
  }
  const pending = data?.connections.filter((c) => c.status === "pending") ?? [];
  const active = data?.connections.filter((c) => c.status === "active") ?? [];
  const shown =
    data?.connections.filter(
      (c) =>
        c.status ===
        (tab === "connections"
          ? "active"
          : tab === "requests"
            ? "pending"
            : "revoked"),
    ) ?? [];
  return (
    <section className="patient-page restored-sharing sharing-page">
      <MobileTopbarActions>
        <Btn
          sm
          icon="clock"
          onClick={(event) => {
            markReturn(event);
            setHistory({});
          }}
        >
          Access history
        </Btn>
      </MobileTopbarActions>
      <header className="phead sharing-desktop-header">
        <div>
          <h1 className="ptitle">Sharing</h1>
          <p className="psub">
            Your care connections. Your choice of what to share.
          </p>
        </div>
        <Btn
          icon="clock"
          onClick={(event) => {
            markReturn(event);
            setHistory({});
          }}
        >
          Access history
        </Btn>
      </header>
      <section
        className="card sharing-discovery"
        aria-labelledby="find-practitioner"
      >
        <div className="sharing-section-head">
          <div>
            <h2 id="find-practitioner">Find a practitioner</h2>
            <p>
              Search by name or profession, then choose what you want to share.
            </p>
          </div>
          <Icon n="steth" s={24} />
        </div>
        <form
          className="sharing-search"
          onSubmit={async (event) => {
            event.preventDefault();
            setSearching(true);
            setSearchError("");
            setSearch(null);
            try {
              setSearch(
                await api("/api/connections", {
                  action: "search",
                  data: { query },
                }),
              );
            } catch (e) {
              setSearchError(errorMessage(e));
            } finally {
              setSearching(false);
            }
          }}
        >
          <label className="searchpill">
            <Icon n="search" />
            <span className="sr-only">Practitioner name or profession</span>
            <input
              type="search"
              name="practitioner"
              placeholder="Name or profession"
              value={query}
              disabled={searching}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearch(null);
              }}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <Btn kind="dark" disabled={searching}>
            {searching ? "Searching…" : "Search practitioners"}
          </Btn>
        </form>
        {searchError && <p role="alert">{searchError}</p>}
        {search && (
          <div className="sharing-search-results" aria-live="polite">
            {search.items.length === 0 ? (
              <p>
                No approved practitioners found. Try another name or profession.
              </p>
            ) : (
              search.items.map((person) => {
                const existing = data?.connections.find(
                  (c) => c.practitioner_account_id === person.id,
                );
                return (
                  <article className="sharing-search-result" key={person.id}>
                    <Identity name={person.display_name} />
                    <div>
                      <h3>{person.display_name}</h3>
                      <p>
                        {person.profession}
                        {person.jurisdiction ? ` · ${person.jurisdiction}` : ""}
                      </p>
                    </div>
                    <Btn
                      sm
                      disabled={!data}
                      onClick={(event) => {
                        markReturn(event);
                        setSelection(
                          existing
                            ? { connection: existing }
                            : { practitioner: person },
                        );
                      }}
                    >
                      {existing ? "View connection" : "Review sharing"}
                    </Btn>
                  </article>
                );
              })
            )}
            {search.hasMore && (
              <p className="sharing-help">
                Showing the first 20 matches. Refine your search to find someone
                specific.
              </p>
            )}
          </div>
        )}
      </section>
      <nav className="sharing-tabs" aria-label="Sharing views">
        {(
          [
            ["connections", "Your connections", active.length],
            ["requests", "Requests", pending.length],
            ["ended", "Ended connections", null],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            className={`pill ${tab === value ? "on" : ""}`}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
            {data && count !== null && (
              <span className="sharing-count">{count}</span>
            )}
          </button>
        ))}
      </nav>
      {error ? (
        <div className="card sharing-empty" role="alert">
          <p>{error}</p>
          <Btn
            onClick={() =>
              void refresh().catch((e) => setError(errorMessage(e)))
            }
          >
            Retry connections
          </Btn>
        </div>
      ) : !data ? (
        <div className="card sharing-empty" role="status">
          Loading your connections…
        </div>
      ) : (
        <>
          {tab === "requests" && (
            <p className="sharing-help">
              Review who is requesting access and the categories they want to
              share. Pending requests do not grant record access.
            </p>
          )}
          {shown.length === 0 ? (
            <div className="card sharing-empty">
              <Icon n={tab === "requests" ? "bell" : "link"} s={28} />
              <h2>
                {tab === "requests"
                  ? "You’re all caught up"
                  : tab === "ended"
                    ? "No ended connections"
                    : "Your care connections start here"}
              </h2>
              <p>
                {tab === "requests"
                  ? "New connection requests will appear here for you to review."
                  : tab === "ended"
                    ? "Connections you end will stay here for reference."
                    : "Find a practitioner above, or review a request from your care team."}
              </p>
            </div>
          ) : (
            <div className="sharing-groups">
              {(["direct", "organization"] as const).map((kind) => {
                const rows = shown.filter((c) => c.kind === kind);
                return (
                  rows.length > 0 && (
                    <section key={kind}>
                      <div className="sharing-section-head">
                        <h2>
                          {kind === "direct"
                            ? "Practitioners"
                            : "Organizations"}
                        </h2>
                        <span className="badge">{rows.length}</span>
                      </div>
                      <div className="sharing-connection-grid">
                        {rows.map((connection) => (
                          <ConnectionCard
                            key={connection.id}
                            connection={connection}
                            onManage={(event) => {
                              markReturn(event);
                              setSelection({ connection });
                            }}
                            onHistory={(event) => {
                              markReturn(event);
                              setHistory({ connection });
                            }}
                          />
                        ))}
                      </div>
                    </section>
                  )
                );
              })}
            </div>
          )}
        </>
      )}
      <details className="card sharing-record-controls">
        <summary>
          <Icon n="doc" />
          Your record & account requests
          <Icon n="chev" />
        </summary>
        <div>
          <p>Download your record or submit an account request for review.</p>
          <div className="sharing-card-actions">
            <Btn asChild sm icon="download">
              <a href="/api/export" download>
                Export your record
              </a>
            </Btn>
            <Link href="/profile">Profile and contacts</Link>
          </div>
          <p className="sharing-help">
            Original files are available in Documents. Review requests do not
            automatically delete shared clinical history or close your account.
          </p>
          <form
            className="account-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              setReviewBusy(true);
              setNotice("");
              try {
                await api("/api/health", {
                  action: "review",
                  data: {
                    kind: fields.get("kind"),
                    eventId: null,
                    reason: fields.get("reason"),
                    requestKey: crypto.randomUUID(),
                  },
                });
                setNotice(
                  "Request submitted for review. Your account remains available.",
                );
                await refresh();
              } catch (e) {
                setNotice(errorMessage(e));
              } finally {
                setReviewBusy(false);
              }
            }}
          >
            <label>
              Request type
              <select name="kind">
                <option value="removal">Review record removal</option>
                <option value="account-closure">Review account closure</option>
              </select>
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={3} maxLength={3000} required />
            </label>
            <Btn type="submit" disabled={reviewBusy}>
              {reviewBusy ? "Submitting…" : "Submit review request"}
            </Btn>
          </form>
          <p role="status">{notice}</p>
          {data?.requests.map((request) => (
            <div className="sharing-review-row" key={request.id}>
              <strong>
                {request.kind === "account-closure"
                  ? "Account closure review"
                  : "Record review"}
              </strong>
              <span className="badge">{request.state}</span>
              <time dateTime={request.created_at}>
                {dateLabel(request.created_at)}
              </time>
            </div>
          ))}
        </div>
      </details>
      {selection && (
        <ConsentPanel
          {...selection}
          onClose={() => setSelection(null)}
          onSaved={refresh}
        />
      )}
      {history && (
        <HistoryPanel {...history} onClose={() => setHistory(null)} />
      )}
    </section>
  );
}
