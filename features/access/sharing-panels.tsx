"use client";
import { useEffect, useState } from "react";
import { SidePanel } from "@/components/ui/side-panel";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client-api";
import { category } from "@/features/health-records/schema";
import {
  categoryLabels,
  dateLabel,
  type Connection,
  type Practitioner,
  type HistoryPage,
} from "./sharing-types";

export function SharingPanel({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <SidePanel
      title={title}
      description={description}
      onClose={onClose}
      returnFocus={() =>
        document.querySelector<HTMLElement>('[data-sharing-return="true"]') ??
        document.querySelector<HTMLElement>(".sharing-page .phead button")
      }
    >
      {children}
    </SidePanel>
  );
}
export function ConsentPanel({
  connection,
  practitioner,
  onClose,
  onSaved,
}: {
  connection?: Connection;
  practitioner?: Practitioner;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revoking, setRevoking] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const name = connection?.display_name ?? practitioner!.display_name;
  const active = connection?.status === "active";
  const awaitingPractitioner =
    connection?.kind === "direct" &&
    connection.status === "pending" &&
    connection.patient_approved &&
    connection.practitioner_approved === false;
  return (
    <SharingPanel
      title={active ? "Manage sharing" : "Review sharing"}
      description={name}
      onClose={onClose}
    >
      <div className="sharing-panel-body">
        <div className="sharing-callout">
          <Icon n="shield" />
          <p>
            You choose which parts of your health record to share. This includes
            future finalized records in those categories once both sides
            approve. Private notes and drafts are excluded.
          </p>
        </div>
        {connection?.method && (
          <p className="sharing-help">
            {connection.status === "pending"
              ? awaitingPractitioner
                ? "Connection request sent"
                : "Connection request received"
              : "Consent recorded"}{" "}
            {connection.status === "pending"
              ? ""
              : connection.method === "in-person"
                ? "in person"
                : "through your account"}
            {connection.recorded_at
              ? ` · ${dateLabel(connection.recorded_at)}`
              : ""}
            .
          </p>
        )}
        {connection?.kind === "organization" && (
          <p className="sharing-help">
            The organization can assign qualified care team members within the
            access you allow.
          </p>
        )}
        {awaitingPractitioner ? (
          <p className="sharing-callout">
            Your sharing choices are saved. This request is awaiting
            practitioner approval; no record access has started.
          </p>
        ) : (
          <form
            className="sharing-consent-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget),
                categories = form.getAll("category").map(String);
              if (!categories.length) {
                setError(
                  "Choose at least one category, or end this connection.",
                );
                setBusy(false);
                return;
              }
              try {
                if (connection)
                  await api("/api/connections", {
                    action: "consent",
                    data: {
                      connectionId: connection.id,
                      version: connection.revision,
                      mode: active
                        ? "narrow"
                        : connection.status === "revoked"
                          ? "reconnect"
                          : "approve",
                      categories,
                      exclusions: active
                        ? (connection.exclusions ?? [])
                        : (connection.exclusions ?? []).filter(
                            (c) => !categories.includes(c),
                          ),
                    },
                  });
                else
                  await api("/api/connections", {
                    action: "connect",
                    data: {
                      practitionerId: practitioner!.id,
                      requestKey,
                      categories,
                      exclusions: [],
                    },
                  });
                await onSaved();
                onClose();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              <legend>What can they access?</legend>
              <div className="sharing-category-grid">
                {category.options.map((c) => {
                  const excluded = connection?.exclusions?.includes(c),
                    allowed =
                      !active || Boolean(connection.categories?.includes(c));
                  return (
                    <label key={c} className="sharing-category">
                      <input
                        type="checkbox"
                        name="category"
                        value={c}
                        defaultChecked={
                          allowed &&
                          !excluded &&
                          (connection?.categories?.includes(c) ?? true)
                        }
                        disabled={active && (!allowed || excluded)}
                      />
                      <span>
                        {categoryLabels[c]}
                        {excluded && (
                          <small>
                            {active
                              ? "Excluded from sharing"
                              : "Previously excluded"}
                          </small>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            {active && (
              <p className="sharing-help">
                You can reduce existing access here. End the connection to stop
                all access through it.
              </p>
            )}
            {connection?.status === "revoked" && (
              <p className="sharing-help">
                Reconnecting requires fresh consent. Previously paused care must
                be reviewed by your practitioner before it can resume.
              </p>
            )}
            <div className="sharing-panel-actions">
              <Btn type="button" onClick={onClose} disabled={busy}>
                Cancel
              </Btn>
              <Btn type="submit" kind="dark" disabled={busy}>
                {busy
                  ? "Saving…"
                  : active
                    ? "Save sharing choices"
                    : connection?.status === "revoked"
                      ? "Confirm reconnection"
                      : connection
                        ? "Confirm sharing"
                        : "Confirm and send request"}
              </Btn>
            </div>
          </form>
        )}
        {connection && connection.status !== "revoked" && (
          <div className="sharing-end">
            {revoking ? (
              <>
                <h3>
                  {connection.status === "pending"
                    ? awaitingPractitioner
                      ? "Withdraw this request?"
                      : "Decline this request?"
                    : "End this connection?"}
                </h3>
                <p>
                  Access through this connection will end. Other connections and
                  your health history stay intact. Previously downloaded copies
                  cannot be recalled.
                </p>
                <div className="sharing-panel-actions">
                  <Btn disabled={busy} onClick={() => setRevoking(false)}>
                    Keep connection
                  </Btn>
                  <Btn
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await api("/api/connections", {
                          action: "revoke",
                          data: { id: connection.id },
                        });
                        await onSaved();
                        onClose();
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Ending…" : "Confirm end of access"}
                  </Btn>
                </div>
              </>
            ) : (
              <Btn onClick={() => setRevoking(true)}>
                {connection.status === "pending"
                  ? awaitingPractitioner
                    ? "Withdraw request"
                    : "Decline request"
                  : "End connection"}
              </Btn>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="sharing-error">
            {error}
          </p>
        )}
      </div>
    </SharingPanel>
  );
}

const historyLabels: Record<string, string> = {
  "record.read": "Viewed a health record entry",
  "file.read.authorized": "Accessed a document",
  "connection.consent.updated": "Recorded or updated sharing consent",
  "connection.revoked": "Ended access through a connection",
  "connection.practitioner.approved": "Practitioner approved the connection",
  "connection.practitioner.declined": "Practitioner declined the connection",
  "connection.approval-settings.updated":
    "Updated automatic connection approval",
};
export function HistoryPanel({
  connection,
  onClose,
}: {
  connection?: Connection;
  onClose: () => void;
}) {
  const [page, setPage] = useState<HistoryPage | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  async function load(before?: HistoryPage["nextCursor"]) {
    setBusy(true);
    setError("");
    try {
      const next = await api<HistoryPage>("/api/connections", {
        action: "history",
        data: {
          ...(connection ? { connectionId: connection.id } : {}),
          ...(before ? { before } : {}),
        },
      });
      setPage((old) => ({
        items: before ? [...(old?.items ?? []), ...next.items] : next.items,
        nextCursor: next.nextCursor,
      }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let current = true;
    void api<HistoryPage>("/api/connections", {
      action: "history",
      data: connection ? { connectionId: connection.id } : {},
    })
      .then((next) => {
        if (current) setPage(next);
      })
      .catch((e) => {
        if (current) setError(errorMessage(e));
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [connection]);
  return (
    <SharingPanel
      title="Access history"
      description={
        connection
          ? `Recorded activity · ${connection.display_name}`
          : "Recorded access and sharing changes across your connections."
      }
      onClose={onClose}
    >
      <div className="sharing-panel-body">
        <p className="sharing-help">
          Newest activity first. This shows recorded operations, not a guarantee
          that a practitioner has reviewed every part of your record.
        </p>
        <ol className="sharing-history">
          {page?.items.map((event) => (
            <li key={event.id}>
              <span className="sharing-history-icon">
                <Icon
                  n={
                    event.action.startsWith("connection.")
                      ? "link"
                      : event.action === "record.read"
                        ? "eye"
                        : "doc"
                  }
                />
              </span>
              <div>
                <strong>{event.actor_name}</strong>
                <p>{historyLabels[event.action] ?? "Updated a connection"}</p>
                <span className="sharing-help">
                  {event.connection_name ? `${event.connection_name} · ` : ""}
                  {event.context_label}
                </span>
                <time dateTime={event.recorded_at}>
                  {dateLabel(event.recorded_at)}
                </time>
              </div>
            </li>
          ))}
        </ol>
        {page?.items.length === 0 && (
          <div className="sharing-empty">
            <Icon n="clock" s={28} />
            <h3>No recorded activity yet</h3>
            <p>Access and connection activity will appear here.</p>
          </div>
        )}
        {busy && <p role="status">Loading activity…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Btn onClick={() => void load(page?.nextCursor)}>
              Retry activity
            </Btn>
          </div>
        )}
        {page?.nextCursor && !busy && !error && (
          <Btn onClick={() => void load(page.nextCursor)}>
            Load older activity
          </Btn>
        )}
      </div>
    </SharingPanel>
  );
}
