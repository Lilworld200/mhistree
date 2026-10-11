"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import { category } from "@/features/health-records/schema";
type Connection = {
  id: string;
  kind: string;
  status: string;
  revision: number;
  display_name: string;
  categories: string[] | null;
  exclusions: string[] | null;
  method: string | null;
  recorded_at: string | null;
  origin_person_ids: string[] | null;
};
type Controls = {
  connections: Connection[];
  history: {
    action: string;
    actor_account_id: string | null;
    context_id: string | null;
    recorded_at: string;
  }[];
  requests: { id: string; kind: string; state: string; created_at: string }[];
};
function ConsentCard({
  connection,
  refresh,
}: {
  connection: Connection;
  refresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <article className="record-card">
      <h3>{connection.display_name}</h3>
      <p>
        {connection.status} · {connection.kind} connection
      </p>
      <p>
        Consent method: {connection.method ?? "Awaiting your approval"}
        {connection.recorded_at
          ? ` · ${new Date(connection.recorded_at).toLocaleString()}`
          : ""}
      </p>
      <p>Scope: {connection.categories?.join(", ") || "None yet"}</p>
      <p>
        Exclusions: {connection.exclusions?.join(", ") || "None specified"}.
        Private notes and drafts are excluded.
      </p>
      <details>
        <summary>
          {connection.status === "active"
            ? "Narrow scope"
            : connection.status === "revoked"
              ? "Review fresh consent"
              : "Review and approve"}
        </summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const form = new FormData(e.currentTarget);
            try {
              await api("/api/connections", {
                action: "consent",
                data: {
                  connectionId: connection.id,
                  version: connection.revision,
                  mode:
                    connection.status === "pending"
                      ? "approve"
                      : connection.status === "revoked"
                        ? "reconnect"
                        : "narrow",
                  categories: form.getAll("category"),
                  exclusions: form.getAll("exclusion"),
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
          <fieldset>
            <legend>
              Permitted categories, including future finalized records
            </legend>
            {category.options.map((c) => (
              <label className="check-row" key={c}>
                <input
                  type="checkbox"
                  name="category"
                  value={c}
                  defaultChecked={(
                    connection.categories ?? category.options
                  ).includes(c)}
                  disabled={
                    connection.status === "active" &&
                    !connection.categories?.includes(c)
                  }
                />
                {c}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Exclude categories</legend>
            {category.options.map((c) => (
              <label className="check-row" key={c}>
                <input
                  type="checkbox"
                  name="exclusion"
                  value={c}
                  defaultChecked={connection.exclusions?.includes(c)}
                />
                {c}
              </label>
            ))}
          </fieldset>
          <p>
            Consent stays within this connection’s existing identity boundaries.
            Reconnection does not restart paused work; a permitted practitioner
            must review it.
          </p>
          <Btn type="submit" disabled={busy}>
            {busy ? "Saving…" : "Confirm consent"}
          </Btn>
        </form>
      </details>
      {connection.status !== "revoked" && (
        <Btn
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                "End access through this connection? Its history stays preserved, and previously downloaded copies cannot be recalled.",
              )
            )
              return;
            setBusy(true);
            try {
              await api("/api/connections", {
                action: "revoke",
                data: { id: connection.id },
              });
              await refresh();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Revoke connection
        </Btn>
      )}
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function PatientControlsView() {
  const [data, setData] = useState<Controls | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setData(await api<Controls>("/api/connections"));
  }
  useEffect(() => {
    void api<Controls>("/api/connections")
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <section className="patient-page">
      <h1>Connections and record controls</h1>
      <p>
        Direct practitioners and organizations have separate access. Revoking
        one does not revoke the others. Prior downloads cannot be recalled.
      </p>
      {["direct", "organization"].map((kind) => (
        <section key={kind}>
          <h2>
            {kind === "direct" ? "Direct practitioners" : "Organizations"}
          </h2>
          {data && !data.connections.some((c) => c.kind === kind) && (
            <p>
              No connections in this group. Provider invitation screens arrive
              in later tasks; no live invitations are invented here.
            </p>
          )}
          {data?.connections
            .filter((c) => c.kind === kind)
            .map((c) => (
              <ConsentCard
                key={`${c.id}:${c.revision}`}
                connection={c}
                refresh={refresh}
              />
            ))}
        </section>
      ))}
      <h2>Meaningful access history</h2>
      <p className="muted">
        Most recent 100 recorded access and connection operations.
      </p>
      {data?.history.map((event, i) => (
        <p key={i}>
          {new Date(event.recorded_at).toLocaleString()} · {event.action} ·{" "}
          {event.actor_account_id ?? "System"}
        </p>
      ))}
      <h2>Your record</h2>
      <p>
        <a href="/api/export" download>
          Download private record export
        </a>{" "}
        · <Link href="/profile">Profile and optional contacts</Link>
      </p>
      <p>
        Original documents can be downloaded separately in Documents. Review
        requests preserve shared clinical history; submitting one does not
        delete it or close your account automatically.
      </p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api("/api/health", {
              action: "review",
              data: {
                kind: f.get("kind"),
                eventId: null,
                reason: f.get("reason"),
                requestKey: crypto.randomUUID(),
              },
            });
            setNotice(
              "Request submitted for review. Your account and clinical history remain available.",
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
          Request type
          <select name="kind">
            <option value="removal">Review removal request</option>
            <option value="account-closure">Review account closure</option>
          </select>
        </label>
        <label>
          Reason
          <textarea name="reason" maxLength={3000} required />
        </label>
        <Btn type="submit" disabled={busy}>
          Submit review request
        </Btn>
        <p role="status">{notice}</p>
      </form>
      {data?.requests.map((r) => (
        <p key={r.id}>
          {r.kind} · {r.state} · {new Date(r.created_at).toLocaleString()}
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
