"use client";
import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { SidePanel } from "@/components/ui/side-panel";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { api, errorMessage } from "@/lib/client-api";
import { careState, careTime, type Today } from "./daily-types";
import { AppointmentPanel } from "./schedule-panels";
import { ScheduleDayPanel } from "./schedule-day-panel";
import {
  ScheduleCalendar,
  appointmentsOnDay,
  type CalendarAppointment,
} from "./schedule-calendar";

function UpcomingSchedule({
  row,
  canManage,
  onManage,
}: {
  row: CalendarAppointment | undefined;
  canManage: boolean;
  onManage: (
    row: CalendarAppointment,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
}) {
  return row ? (
    <div className="schedule-next-details">
      <span className="badge">Confirmed</span>
      <h3>{row.patientName}</h3>
      <time dateTime={row.starts_at}>
        {careTime(row.starts_at, row.timezone)}
      </time>
      <p className="sharing-help">
        Until {careTime(row.ends_at, row.timezone)}
        {row.timezone ? ` · ${row.timezone}` : ""}
      </p>
      {canManage && (
        <Btn sm onClick={(event) => onManage(row, event)}>
          View appointment
        </Btn>
      )}
    </div>
  ) : (
    <div className="daily-empty">
      <Icon n="cal" s={24} />
      <h3>No upcoming schedule</h3>
      <p>Your next confirmed appointment will appear here.</p>
    </div>
  );
}

export function ScheduleView({
  initial,
  canManage,
}: {
  initial: Today;
  canManage: boolean;
}) {
  const [asOf, setAsOf] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setAsOf(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [data, setData] = useState<Today | null>(initial);
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [day, setDay] = useState<Date | null>(null),
    [appointment, setAppointment] = useState<CalendarAppointment | null>(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [history, setHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null),
    loading = useRef(false);
  function clear(e: unknown) {
    setData(null);
    setDay(null);
    setAppointment(null);
    setHistory(false);
    setUpcomingOpen(false);
    setError(errorMessage(e));
  }
  async function reload(selected = month) {
    const from = new Date(
      selected.getFullYear(),
      selected.getMonth(),
      1,
    ).toISOString();
    const to = new Date(
      selected.getFullYear(),
      selected.getMonth() + 1,
      1,
    ).toISOString();
    try {
      const fresh = await api<Today>(
        `/api/practitioner/today?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      setData(fresh);
      setAsOf(Date.now());
      setError("");
    } catch (e) {
      clear(e);
      throw e;
    }
  }
  async function loadMonth(selected = month) {
    if (loading.current) return;
    loading.current = true;
    setBusy(true);
    setMonth(selected);
    setData(null);
    setDay(null);
    setAppointment(null);
    setHistory(false);
    setUpcomingOpen(false);
    try {
      await reload(selected);
    } catch {
    } finally {
      loading.current = false;
      setBusy(false);
    }
  }
  const rows = (data?.items ?? [])
    .flatMap((item) =>
      item.appointments.map((a) => ({
        ...a,
        connectionId: item.connectionId,
        patientName: item.patientName,
      })),
    )
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const requests = rows.filter(
    (row) => row.state === "requested" && Date.parse(row.ends_at) > asOf,
  );
  const nextAppointment = (data?.items ?? [])
    .flatMap((item) => {
      const candidates =
        item.upcomingAppointment === undefined
          ? item.appointments
          : item.upcomingAppointment
            ? [item.upcomingAppointment]
            : [];
      return candidates
        .filter(
          (row) => row.state === "accepted" && Date.parse(row.ends_at) > asOf,
        )
        .map((row) => ({
          ...row,
          connectionId: item.connectionId,
          patientName: item.patientName,
        }));
    })
    .sort(
      (a, b) =>
        Date.parse(a.starts_at) - Date.parse(b.starts_at) ||
        a.id.localeCompare(b.id),
    )[0];
  const past = rows
    .filter(
      (row) =>
        Date.parse(row.ends_at) <= asOf ||
        ["cancelled", "declined", "paused"].includes(row.state),
    )
    .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  const returnFocus = () =>
    trigger.current?.isConnected
      ? trigger.current
      : document.querySelector<HTMLButtonElement>(
          ".schedule-month-actions button",
        );
  const openHistory = (event: React.MouseEvent<HTMLElement>) => {
    trigger.current = event.currentTarget;
    setHistory(true);
  };
  function manage(
    row: CalendarAppointment,
    event?: React.MouseEvent<HTMLElement>,
  ) {
    if (event && !upcomingOpen) trigger.current = event.currentTarget;
    setDay(null);
    setHistory(false);
    setUpcomingOpen(false);
    setAppointment(row);
  }
  const historyButton = (
    <Btn sm icon="clock" onClick={openHistory} disabled={!data || busy}>
      History
    </Btn>
  );
  return (
    <section className="patient-page sharing-page practitioner-daily schedule-page">
      <MobileTopbarActions>
        <Btn
          sm
          icon="cal"
          disabled={!data || busy}
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setUpcomingOpen(true);
          }}
        >
          Upcoming schedule
        </Btn>
      </MobileTopbarActions>
      <header className="phead sharing-desktop-header">
        <div>
          <h1 className="ptitle">Schedule</h1>
          <p className="psub">Your appointments, one day at a time.</p>
        </div>
        <div className="sharing-card-actions">
          <Btn sm disabled={busy} onClick={() => void loadMonth()}>
            Refresh
          </Btn>
          {historyButton}
        </div>
      </header>
      {error && (
        <div className="card daily-section" role="alert">
          <p>{error}</p>
          <Btn onClick={() => void loadMonth()} disabled={busy}>
            Retry current access
          </Btn>
        </div>
      )}
      {busy && (
        <div className="card daily-section" role="status">
          Loading your calendar…
        </div>
      )}
      {data && (
        <>
          <div className="schedule-calendar-layout">
            <ScheduleCalendar
              asOf={asOf}
              month={month}
              rows={rows}
              busy={busy}
              onMonth={(selected) => void loadMonth(selected)}
              onDay={(date, event) => {
                trigger.current = event.currentTarget;
                setDay(date);
              }}
            />
            <aside
              className="card daily-section schedule-next-card"
              aria-labelledby="schedule-next-title"
            >
              <h2 id="schedule-next-title">Upcoming schedule</h2>
              <div
                className="schedule-next-scroll"
                role="region"
                aria-label="Upcoming schedule details"
                tabIndex={0}
              >
                <UpcomingSchedule
                  row={nextAppointment}
                  canManage={canManage}
                  onManage={manage}
                />
              </div>
            </aside>
          </div>
          <section className="card daily-section schedule-requests">
            <div className="sharing-section-head">
              <div>
                <h2>Appointment requests</h2>
                <p className="sharing-help">
                  Review a request to add it to your calendar.
                </p>
              </div>
              <span className="badge">{requests.length} pending</span>
            </div>
            {requests.length ? (
              <div className="daily-list">
                {requests.map((row) => (
                  <article className="daily-row" key={row.id}>
                    <span className="daily-row-icon">
                      <Icon n="cal" />
                    </span>
                    <div className="daily-row-main">
                      <h3>{row.patientName}</h3>
                      <time dateTime={row.starts_at}>
                        {careTime(row.starts_at, row.timezone)}
                      </time>
                      <p>
                        Until {careTime(row.ends_at, row.timezone)}
                        {row.timezone ? ` · ${row.timezone}` : ""}
                      </p>
                    </div>
                    {canManage ? (
                      <Btn sm onClick={(event) => manage(row, event)}>
                        Manage appointment
                      </Btn>
                    ) : (
                      <span className="badge">Requested</span>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="daily-empty">
                <Icon n="cal" s={24} />
                <h3>No appointment requests</h3>
                <p>New patient requests will appear here.</p>
              </div>
            )}
          </section>
          <p className="sharing-help">
            Direct-care calendar.{" "}
            {data.limited
              ? "Some connections or appointments are outside this bounded worklist. Open My patients for other connections."
              : "Appointments are loaded for the selected month, with pending requests across dates."}{" "}
            Up to 100 appointments per connection and 30 active connections;
            this is not a complete lifetime history.
          </p>
        </>
      )}
      {data && day && (
        <ScheduleDayPanel
          key={day.toISOString()}
          asOf={asOf}
          date={day}
          rows={appointmentsOnDay(rows, day)}
          data={data}
          canManage={canManage}
          onManage={(row) => manage(row)}
          onSaved={reload}
          onClose={() => setDay(null)}
          onAccessLost={clear}
          returnFocus={returnFocus}
        />
      )}
      {data && appointment && (
        <AppointmentPanel
          key={appointment.id}
          appointment={appointment}
          patientName={appointment.patientName}
          connectionId={appointment.connectionId}
          onClose={() => setAppointment(null)}
          onSaved={reload}
          onAccessLost={clear}
          returnFocus={returnFocus}
        />
      )}
      {data && upcomingOpen && (
        <SidePanel
          className="schedule-panel schedule-upcoming-popup"
          title="Upcoming schedule"
          description="Your nearest confirmed appointment."
          onClose={() => setUpcomingOpen(false)}
          returnFocus={returnFocus}
        >
          <div className="sharing-panel-body">
            <UpcomingSchedule
              row={nextAppointment}
              canManage={canManage}
              onManage={manage}
            />
          </div>
        </SidePanel>
      )}
      {data && history && (
        <SidePanel
          className="schedule-panel"
          title="Appointment history"
          description={`${month.toLocaleDateString(undefined, { month: "long", year: "numeric" })} · direct-care appointments`}
          onClose={() => setHistory(false)}
          returnFocus={returnFocus}
        >
          <div className="sharing-panel-body">
            {past.length ? (
              past.map((row) => (
                <article className="schedule-day-booking" key={row.id}>
                  <span className="badge">{careState(row.state)}</span>
                  <h3>{row.patientName}</h3>
                  <p>
                    {careTime(row.starts_at, row.timezone)} –{" "}
                    {careTime(row.ends_at, row.timezone)}
                  </p>
                  {row.state === "paused" && (
                    <p className="sharing-help">
                      Paused work requires explicit review in the patient
                      workspace.
                    </p>
                  )}
                </article>
              ))
            ) : (
              <p>
                No recent appointments in this month. Browse an earlier month to
                see its history.
              </p>
            )}
          </div>
        </SidePanel>
      )}
    </section>
  );
}
