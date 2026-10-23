"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { api, errorMessage } from "@/lib/client-api";
import { dateLabel } from "@/features/access/sharing-types";
import { AvailabilityPanel, AppointmentPanel } from "./schedule-panels";
import {
  careState,
  careTime,
  isCareAccessError,
  patientWorkspace,
  type Today,
  type DailyView,
  type Appointment,
} from "./daily-types";
import type { AssignedPatient } from "./patient-types";

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
  dashboard: [
    "Today",
    "Appointments, conversations and work that needs your attention.",
  ],
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
type AppointmentRow = Appointment & {
  connectionId: string;
  patientName: string;
};
function AppointmentRows({
  rows,
  canManageAppointments,
  onManage,
}: {
  rows: AppointmentRow[];
  canManageAppointments: boolean;
  onManage: (row: AppointmentRow, event: React.MouseEvent<HTMLElement>) => void;
}) {
  return (
    <div className="daily-list">
      {rows.map((a) => (
        <article className="daily-row" key={`${a.connectionId}:${a.id}`}>
          <span className="daily-row-icon">
            <Icon n="cal" />
          </span>
          <div className="daily-row-main">
            <h3>{a.patientName}</h3>
            <time dateTime={a.starts_at}>
              {careTime(a.starts_at, a.timezone)}
            </time>
            <p>
              Until {careTime(a.ends_at, a.timezone)}
              {a.timezone ? ` · ${a.timezone}` : ""}
            </p>
          </div>
          <span className="badge">{careState(a.state)}</span>
          {canManageAppointments &&
          ["requested", "accepted"].includes(a.state) ? (
            <Btn
              sm
              onClick={(event) => {
                onManage(a, event);
              }}
            >
              Manage appointment
            </Btn>
          ) : (
            <Btn asChild sm>
              <Link href={patientWorkspace(a.connectionId)}>
                Patient workspace
              </Link>
            </Btn>
          )}
        </article>
      ))}
    </div>
  );
}
function OrganizationLinks({ assigned }: { assigned: AssignedPatient[] }) {
  return (
    <section className="card daily-section">
      <div className="sharing-section-head">
        <h2>Organization care</h2>
        <Icon n="cross" />
      </div>
      {assigned.length === 0 ? (
        <p className="sharing-help">
          Organization-assigned patients appear in My patients when an
          organization assigns care to you.
        </p>
      ) : (
        <div className="daily-list">
          {assigned.map((row) => (
            <Link
              className="daily-row daily-link"
              key={`${row.assignment_id}:${row.connection_id ?? row.basis_id}`}
              href={`/organizations/record?organization=${row.organization_id}&${row.basis_id ? `basis=${row.basis_id}` : `connection=${row.connection_id}`}&assignment=${row.assignment_id}`}
            >
              <div className="daily-row-main">
                <h3>{row.display_name}</h3>
                <p>{row.organization_name}</p>
              </div>
              <Icon n="chev" />
            </Link>
          ))}
        </div>
      )}
      <Link href="/clinician/patients">View patient assignments</Link>
    </section>
  );
}
export function TodayView({
  initial,
  view = "dashboard",
  assigned = [],
  canManageAppointments = false,
}: {
  initial: Today;
  view?: DailyView;
  assigned?: AssignedPatient[];
  canManageAppointments?: boolean;
}) {
  const [data, setData] = useState<Today | null>(initial),
    [asOf, setAsOf] = useState(() => Date.now()),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [availability, setAvailability] = useState(false),
    [slotToRemove, setSlotToRemove] = useState<string | null>(null);
  const [appointment, setAppointment] = useState<{
    item: Appointment;
    connectionId: string;
    patientName: string;
  } | null>(null);
  const trigger = useRef<HTMLElement | null>(null),
    router = useRouter();
  async function reload() {
    try {
      setData(await api<Today>("/api/practitioner/today"));
      setAsOf(Date.now());
      setError("");
      router.refresh();
    } catch (e) {
      setData(null);
      setAppointment(null);
      setAvailability(false);
      setError(errorMessage(e));
      throw e;
    }
  }
  function clearDeniedCare(error: unknown) {
    setData(null);
    setAppointment(null);
    setAvailability(false);
    setError(errorMessage(error));
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
  function remember(event: React.MouseEvent<HTMLElement>) {
    trigger.current = event.currentTarget;
  }
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const items = data?.items ?? [];
  const appointments = items
    .flatMap((item) =>
      item.appointments.map((a) => ({
        ...a,
        connectionId: item.connectionId,
        patientName: item.patientName,
      })),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const upcoming = appointments.filter(
    (a) =>
      ["requested", "accepted"].includes(a.state) &&
      Date.parse(a.ends_at) > asOf,
  );
  const appointmentHistory = appointments.filter(
    (a) =>
      !["requested", "accepted"].includes(a.state) ||
      Date.parse(a.ends_at) <= asOf,
  );
  const requests = items.flatMap((item) =>
    item.requests.map((r) => ({
      ...r,
      connectionId: item.connectionId,
      patientName: item.patientName,
    })),
  );
  const reminders = items.flatMap((item) =>
    item.reminders.map((r) => ({
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
  function manageAppointment(
    a: AppointmentRow,
    event: React.MouseEvent<HTMLElement>,
  ) {
    remember(event);
    setAppointment({
      item: a,
      connectionId: a.connectionId,
      patientName: a.patientName,
    });
  }
  const title = viewTitles[view];
  const addSlot = (event: React.MouseEvent<HTMLElement>) => {
    remember(event);
    setAvailability(true);
  };

  return (
    <section className="patient-page sharing-page practitioner-daily">
      <MobileTopbarActions>
        {view === "schedule" && canManageAppointments ? (
          <Btn sm icon="plus" onClick={addSlot}>
            Availability
          </Btn>
        ) : (
          <Btn sm icon="clock" disabled={busy} onClick={() => void refresh()}>
            {busy ? "Refreshing…" : "Refresh"}
          </Btn>
        )}
      </MobileTopbarActions>
      <header className="phead sharing-desktop-header">
        <div>
          <h1 className="ptitle">{title[0]}</h1>
          <p className="psub">{title[1]}</p>
        </div>
        <div className="sharing-card-actions">
          <Btn sm icon="clock" disabled={busy} onClick={() => void refresh()}>
            {busy ? "Refreshing…" : "Refresh"}
          </Btn>
          {view === "schedule" && canManageAppointments && (
            <Btn kind="dark" icon="plus" onClick={addSlot}>
              Add availability
            </Btn>
          )}
        </div>
      </header>
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
            <>
              <div className="daily-shortcuts">
                {(
                  [
                    ["/clinician/schedule", "Schedule", "cal"],
                    ["/clinician/inbox", "Care inbox", "chat"],
                    ["/clinician/requests", "Requests & results", "doc"],
                  ] as const
                ).map(([href, label, icon]) => (
                  <Btn asChild key={href} icon={icon}>
                    <Link href={href}>{label}</Link>
                  </Btn>
                ))}
              </div>
              <div className="daily-dashboard-grid">
                <section className="card daily-section">
                  <div className="sharing-section-head">
                    <h2>Upcoming appointments</h2>
                    <Link href="/clinician/schedule">View schedule</Link>
                  </div>
                  {upcoming.length ? (
                    <AppointmentRows
                      canManageAppointments={canManageAppointments}
                      onManage={manageAppointment}
                      rows={upcoming.slice(0, 5)}
                    />
                  ) : (
                    <Empty title="No upcoming appointments">
                      Your requested and accepted appointments will appear here.
                    </Empty>
                  )}
                </section>
                <section className="card daily-section">
                  <div className="sharing-section-head">
                    <h2>Unread conversations</h2>
                    <Link href="/clinician/inbox">Open inbox</Link>
                  </div>
                  {items.some((item) => item.unread > 0) ? (
                    items
                      .filter((item) => item.unread > 0)
                      .slice(0, 5)
                      .map((item) => (
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
                            <h3>{item.patientName}</h3>
                            <p>Direct care conversation</p>
                          </div>
                          <span className="badge">{item.unread} unread</span>
                        </Link>
                      ))
                  ) : (
                    <Empty icon="chat" title="No unread conversations">
                      New patient messages will appear here.
                    </Empty>
                  )}
                </section>
                <section className="card daily-section">
                  <div className="sharing-section-head">
                    <h2>Outstanding requests</h2>
                    <Link href="/clinician/requests">View requests</Link>
                  </div>
                  {requests.some(
                    (r) => !["finalized", "cancelled"].includes(r.state),
                  ) ? (
                    requests
                      .filter(
                        (r) => !["finalized", "cancelled"].includes(r.state),
                      )
                      .slice(0, 5)
                      .map((r) => (
                        <Link
                          className="daily-row daily-link"
                          key={`${r.connectionId}:${r.id}`}
                          href={patientWorkspace(
                            r.connectionId,
                            "requests-results",
                          )}
                        >
                          <div className="daily-row-main">
                            <h3>{r.service_name}</h3>
                            <p>{r.patientName}</p>
                          </div>
                          <span className="badge">{careState(r.state)}</span>
                        </Link>
                      ))
                  ) : (
                    <Empty icon="doc" title="No outstanding requests">
                      Active service requests will appear here.
                    </Empty>
                  )}
                </section>
                <section className="card daily-section">
                  <div className="sharing-section-head">
                    <h2>Finalized results</h2>
                    <Link href="/clinician/requests">View results</Link>
                  </div>
                  {requests.some(
                    (r) => r.state === "finalized" && r.result_event_id,
                  ) ? (
                    requests
                      .filter(
                        (r) => r.state === "finalized" && r.result_event_id,
                      )
                      .slice(0, 5)
                      .map((r) => (
                        <Link
                          className="daily-row daily-link"
                          key={`${r.connectionId}:${r.id}`}
                          href={patientWorkspace(
                            r.connectionId,
                            "requests-results",
                          )}
                        >
                          <div className="daily-row-main">
                            <h3>{r.service_name}</h3>
                            <p>{r.patientName}</p>
                          </div>
                          <span className="badge">Finalized</span>
                        </Link>
                      ))
                  ) : (
                    <Empty icon="check" title="No finalized results to show">
                      Results appear after deliberate professional finalization.
                    </Empty>
                  )}
                </section>
                <section className="card daily-section">
                  <div className="sharing-section-head">
                    <h2>Private reminders</h2>
                    <Icon n="lock" />
                  </div>
                  {reminders.length ? (
                    reminders.map((r) => (
                      <article className="daily-row" key={r.id}>
                        <div className="daily-row-main">
                          <h3>{r.patientName}</h3>
                          <p>{r.body.text}</p>
                          {r.due_at && (
                            <time dateTime={r.due_at}>
                              {dateLabel(r.due_at)}
                            </time>
                          )}
                          <Link
                            href={patientWorkspace(
                              r.connectionId,
                              "private-work",
                            )}
                          >
                            Open private work
                          </Link>
                        </div>
                      </article>
                    ))
                  ) : (
                    <Empty icon="lock" title="No private reminders">
                      Manage your author-only reminders in the patient
                      workspace.
                    </Empty>
                  )}
                </section>
                <section className="card daily-section">
                  <div className="sharing-section-head">
                    <h2>Recent activity</h2>
                    <Icon n="bell" />
                  </div>
                  {data.notifications.length ? (
                    data.notifications.map((n) => (
                      <article className="daily-row" key={n.id}>
                        <div className="daily-row-main">
                          <h3>
                            {{
                              message: "Care message update",
                              appointment: "Appointment update",
                              request: "Service request update",
                            }[n.kind] ?? "Care activity"}
                          </h3>
                          <time dateTime={n.created_at}>
                            {dateLabel(n.created_at)}
                          </time>
                          {n.connection_id && (
                            <Link
                              href={patientWorkspace(
                                n.connection_id,
                                n.kind === "message"
                                  ? "care-text-inbox"
                                  : n.kind === "request"
                                    ? "requests-results"
                                    : undefined,
                              )}
                            >
                              Open care context
                            </Link>
                          )}
                        </div>
                      </article>
                    ))
                  ) : (
                    <Empty icon="bell" title="No recent activity">
                      Updates from your direct care connections will appear
                      here.
                    </Empty>
                  )}
                </section>
              </div>
              <OrganizationLinks assigned={assigned} />
            </>
          ) : view === "schedule" ? (
            <>
              <section className="card daily-section">
                <div className="sharing-section-head">
                  <h2>Appointments</h2>
                  <span className="badge">Direct care</span>
                </div>
                <nav className="sharing-tabs" aria-label="Appointment filters">
                  {[
                    ["all", "Upcoming"],
                    ["requested", "Needs a response"],
                    ["history", "Recent history"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`pill ${filter === value ? "on" : ""}`}
                      aria-pressed={filter === value}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                {(filter === "history"
                  ? appointmentHistory
                  : filter === "requested"
                    ? upcoming.filter((a) => a.state === "requested")
                    : upcoming
                ).length ? (
                  <AppointmentRows
                    canManageAppointments={canManageAppointments}
                    onManage={manageAppointment}
                    rows={
                      filter === "history"
                        ? appointmentHistory
                        : filter === "requested"
                          ? upcoming.filter((a) => a.state === "requested")
                          : upcoming
                    }
                  />
                ) : (
                  <Empty title="No appointments in this view">
                    Patient requests and appointment updates will appear here.
                  </Empty>
                )}
              </section>
              <section className="card daily-section">
                <div className="sharing-section-head">
                  <h2>Your availability</h2>
                  <Icon n="clock" />
                </div>
                {!canManageAppointments && (
                  <p className="sharing-help">
                    Your professional permissions do not include managing
                    appointments.
                  </p>
                )}
                {data.availability.length ? (
                  data.availability.map((slot) => (
                    <article className="daily-row" key={slot.id}>
                      <div className="daily-row-main">
                        <time dateTime={slot.starts_at}>
                          {careTime(slot.starts_at, slot.timezone)} –{" "}
                          {careTime(slot.ends_at, slot.timezone)}
                        </time>
                        {slot.timezone && <p>{slot.timezone}</p>}
                        {slotToRemove === slot.id && (
                          <p>
                            Remove this availability? Existing appointments
                            remain unchanged.
                          </p>
                        )}
                      </div>
                      {canManageAppointments && (
                        <>
                          <Btn
                            sm
                            disabled={busy}
                            onClick={async () => {
                              if (slotToRemove !== slot.id) {
                                setSlotToRemove(slot.id);
                                return;
                              }
                              setBusy(true);
                              try {
                                await api("/api/practitioner/today", {
                                  action: "remove",
                                  data: { id: slot.id, version: slot.version },
                                });
                                await reload();
                                setSlotToRemove(null);
                              } catch (e) {
                                if (isCareAccessError(e)) clearDeniedCare(e);
                                setError(errorMessage(e));
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            {slotToRemove === slot.id
                              ? "Confirm removal"
                              : "Remove slot"}
                          </Btn>
                          {slotToRemove === slot.id && (
                            <Btn
                              sm
                              onClick={() => setSlotToRemove(null)}
                              disabled={busy}
                            >
                              Keep slot
                            </Btn>
                          )}
                        </>
                      )}
                    </article>
                  ))
                ) : (
                  <Empty icon="clock" title="No availability set">
                    Add a time slot when you are available for direct-care
                    appointments.
                  </Empty>
                )}
              </section>
            </>
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
                        <h2>{item.patientName}</h2>
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
      {availability && (
        <AvailabilityPanel
          onClose={() => setAvailability(false)}
          onSaved={reload}
          onAccessLost={clearDeniedCare}
          returnFocus={() => trigger.current}
        />
      )}
      {appointment && (
        <AppointmentPanel
          appointment={appointment.item}
          patientName={appointment.patientName}
          connectionId={appointment.connectionId}
          onClose={() => setAppointment(null)}
          onSaved={reload}
          onAccessLost={clearDeniedCare}
          returnFocus={() => trigger.current}
        />
      )}
    </section>
  );
}
