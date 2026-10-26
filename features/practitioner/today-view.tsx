"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { api, errorMessage } from "@/lib/client-api";
import { TodayDashboard } from "./today-dashboard";
import { ScheduleView } from "./schedule-view";
import { useCareNotifications } from "./notification-context";
import { NotificationDot } from "@/components/ui/notification-dot";
import {
  careState,
  patientWorkspace,
  type Today,
  type DailyView,
} from "./daily-types";

function Empty({
  icon = "cal",
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: string;
}) {
  return (
    <div className="daily-empty">
      <Icon n={icon} s={24} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
const viewTitles = {
  dashboard: ["Today", "Recent care updates and your private reminders."],
  schedule: [
    "Schedule",
    "Manage direct-care appointments and your availability.",
  ],
  inbox: [
    "Care inbox",
    "Patient conversations, separate from your personal AI chat.",
  ],
  requests: [
    "Requests & results",
    "Track direct-care service requests and finalized results.",
  ],
};
export function TodayView(props: {
  initial: Today;
  view?: DailyView;
  canManageAppointments?: boolean;
}) {
  return props.view === "schedule" ? (
    <ScheduleView
      initial={props.initial}
      canManage={props.canManageAppointments ?? false}
    />
  ) : (
    <DailyWorkView {...props} />
  );
}
function DailyWorkView({
  initial,
  view = "dashboard",
}: {
  initial: Today;
  view?: DailyView;
  canManageAppointments?: boolean;
}) {
  const [data, setData] = useState<Today | null>(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const router = useRouter();
  const { snapshot, ready } = useCareNotifications();
  const notificationVersion = JSON.stringify(snapshot.connections);
  const lastNotificationVersion = useRef<string | undefined>(undefined);
  const reloadLatest = useRef(reload);
  useEffect(() => {
    reloadLatest.current = reload;
  });
  useEffect(() => {
    if (!ready) return;
    if (lastNotificationVersion.current === undefined) {
      lastNotificationVersion.current = notificationVersion;
      return;
    }
    if (lastNotificationVersion.current !== notificationVersion) {
      lastNotificationVersion.current = notificationVersion;
      void reloadLatest.current().catch(() => {});
    }
  }, [ready, notificationVersion]);
  async function reload() {
    try {
      setData(await api<Today>("/api/practitioner/today"));
      setError("");
      router.refresh();
    } catch (e) {
      setData(null);
      setError(errorMessage(e));
      throw e;
    }
  }
  async function refresh() {
    setBusy(true);
    try {
      await reload();
    } catch {
    } finally {
      setBusy(false);
    }
  }
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const items = (data?.items ?? []).map((item) => ({
    ...item,
    unread: ready
      ? (snapshot.connections.find((c) => c.connectionId === item.connectionId)
          ?.unread ?? 0)
      : item.unread,
  }));
  const requests = items.flatMap((item) =>
    item.requests.map((r) => ({
      ...r,
      connectionId: item.connectionId,
      patientName: item.patientName,
    })),
  );
  const inbox = items.filter(
    (item) =>
      matches(item.patientName) && (filter !== "unread" || item.unread > 0),
  );
  const requestRows = requests.filter(
    (r) =>
      matches(`${r.patientName} ${r.service_name}`) &&
      (filter === "all" || filter === "open"
        ? !["finalized", "cancelled"].includes(r.state)
        : filter === "results"
          ? r.state === "finalized"
          : r.state === filter),
  );
  const title = viewTitles[view];

  return (
    <section className="patient-page sharing-page practitioner-daily">
      <MobileTopbarActions>
        <Btn sm icon="clock" disabled={busy} onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh"}
        </Btn>
      </MobileTopbarActions>
      {view !== "dashboard" && (
        <header className="phead sharing-desktop-header">
          <div>
            <h1 className="ptitle">{title[0]}</h1>
            <p className="psub">{title[1]}</p>
          </div>
          <div className="sharing-card-actions">
            <Btn sm icon="clock" disabled={busy} onClick={() => void refresh()}>
              {busy ? "Refreshing…" : "Refresh"}
            </Btn>
          </div>
        </header>
      )}
      {error && (
        <div className="card daily-section" role="alert">
          <p>{error}</p>
          <Btn onClick={() => void refresh()} disabled={busy}>
            Retry current access
          </Btn>
        </div>
      )}
      {data && (
        <>
          {view === "dashboard" ? (
            <TodayDashboard
              data={data}
              busy={busy}
              onRefresh={() => void refresh()}
            />
          ) : view === "inbox" ? (
            <>
              <label className="searchpill daily-search">
                <Icon n="search" />
                <span className="sr-only">Search conversations</span>
                <input
                  type="search"
                  placeholder="Search patient conversations"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <nav className="sharing-tabs" aria-label="Inbox filters">
                {[
                  ["all", "All direct patients"],
                  ["unread", "Unread"],
                ].map(([value, label]) => (
                  <button
                    className={`pill ${filter === value ? "on" : ""}`}
                    aria-pressed={filter === value}
                    key={value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <section className="card daily-section">
                {inbox.length ? (
                  inbox.map((item) => (
                    <Link
                      className="daily-row daily-link"
                      key={item.connectionId}
                      href={patientWorkspace(
                        item.connectionId,
                        "care-text-inbox",
                      )}
                    >
                      <span className="daily-row-icon">
                        <Icon n="chat" />
                      </span>
                      <div className="daily-row-main">
                        <h2>
                          {item.patientName}
                          {item.unread > 0 && <NotificationDot />}
                        </h2>
                        <p>
                          {item.unread > 0
                            ? `${item.unread} unread messages`
                            : "Open the patient workspace to view or start a conversation."}
                        </p>
                      </div>
                      <Icon n="chev" />
                    </Link>
                  ))
                ) : (
                  <Empty icon="chat" title="No conversations in this view">
                    Try another filter or check your patient connections.
                  </Empty>
                )}
              </section>
            </>
          ) : (
            <>
              <label className="searchpill daily-search">
                <Icon n="search" />
                <span className="sr-only">Search requests</span>
                <input
                  type="search"
                  placeholder="Search by patient or service"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <nav className="sharing-tabs" aria-label="Request filters">
                {[
                  ["all", "Outstanding"],
                  ["results", "Finalized results"],
                  ["paused", "Paused"],
                  ["cancelled", "Cancelled"],
                ].map(([value, label]) => (
                  <button
                    className={`pill ${filter === value ? "on" : ""}`}
                    aria-pressed={filter === value}
                    key={value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="sharing-connection-grid">
                {requestRows.length ? (
                  requestRows.map((r) => (
                    <article
                      className="card sharing-connection"
                      key={`${r.connectionId}:${r.id}`}
                    >
                      <div className="sharing-person">
                        <span className="sharing-avatar">
                          <Icon n="doc" />
                        </span>
                        <div>
                          <h2>{r.service_name}</h2>
                          <p>{r.patientName}</p>
                        </div>
                        <span className="badge">{careState(r.state)}</span>
                      </div>
                      {r.state === "paused" && (
                        <p className="sharing-help">
                          Paused work needs an explicit authorized review before
                          resuming.
                        </p>
                      )}
                      <Btn sm asChild>
                        <Link
                          href={patientWorkspace(
                            r.connectionId,
                            "requests-results",
                          )}
                        >
                          {r.state === "finalized"
                            ? "View result in workspace"
                            : "Open request in workspace"}
                        </Link>
                      </Btn>
                    </article>
                  ))
                ) : (
                  <section className="card daily-section">
                    <Empty icon="doc" title="No requests in this view">
                      Requests and finalized results appear here as care
                      progresses.
                    </Empty>
                  </section>
                )}
              </div>
            </>
          )}
          {view !== "dashboard" && (
            <p className="sharing-help">
              This worklist covers direct care. For organization care,{" "}
              <Link href="/clinician/patients">
                choose an assigned patient and organization context
              </Link>
              .
            </p>
          )}
          <p className="sharing-help">
            {data.limited
              ? "Showing work for the first 30 active direct connections. Open My patients for all loaded connections."
              : "Worklists use your active direct connections."}{" "}
            Lists are bounded; they do not represent a complete lifetime
            history.
          </p>
        </>
      )}
    </section>
  );
}
