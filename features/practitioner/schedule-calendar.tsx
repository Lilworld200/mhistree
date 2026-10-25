"use client";
import type { MouseEvent } from "react";
import { Btn } from "@/components/ui/button";
import type { Appointment } from "./daily-types";
export type CalendarAppointment = Appointment & {
  connectionId: string;
  patientName: string;
};
export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function appointmentsOnDay(rows: CalendarAppointment[], date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()),
    end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return rows.filter(
    (row) =>
      Date.parse(row.starts_at) < end.getTime() &&
      Date.parse(row.ends_at) > start.getTime(),
  );
}
export function ScheduleCalendar({
  month,
  asOf,
  rows,
  busy,
  onMonth,
  onDay,
}: {
  month: Date;
  asOf: number;
  rows: CalendarAppointment[];
  busy: boolean;
  onMonth: (month: Date) => void;
  onDay: (day: Date, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const offset = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const booked = rows.filter((row) => row.state === "accepted");
  const cells = Array.from(
    { length: Math.ceil((offset + count) / 7) * 7 },
    (_, i) => i - offset + 1,
  );
  const dateFor = (day: number) =>
    new Date(month.getFullYear(), month.getMonth(), day);
  const status = (day: number) => {
    if (day < 1 || day > count) return "";
    const bookings = appointmentsOnDay(booked, dateFor(day));
    return bookings.length
      ? bookings.every((row) => Date.parse(row.ends_at) <= asOf)
        ? "past"
        : "booked"
      : "";
  };
  return (
    <section
      className="card daily-section schedule-calendar"
      aria-label="Appointment calendar"
      aria-busy={busy}
    >
      <div className="schedule-calendar-heading">
        <div>
          <h2 aria-live="polite">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h2>
        </div>
        <div className="schedule-month-actions">
          <Btn
            sm
            disabled={busy}
            aria-label="Previous month"
            onClick={() =>
              onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ‹
          </Btn>
          <Btn
            sm
            disabled={busy}
            onClick={() =>
              onMonth(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Today
          </Btn>
          <Btn
            sm
            disabled={busy}
            aria-label="Next month"
            onClick={() =>
              onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            ›
          </Btn>
        </div>
      </div>
      <div className="schedule-weekdays" aria-hidden="true">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="schedule-month-grid">
        {cells.map((day, i) => {
          if (day < 1 || day > count)
            return <span key={i} className="schedule-date-empty" />;
          const date = dateFor(day),
            state = status(day),
            appointments = appointmentsOnDay(booked, date);
          const joinBefore = i % 7 !== 0 && state && Boolean(status(day - 1));
          const joinAfter = i % 7 !== 6 && state && Boolean(status(day + 1));
          const today = dayKey(date) === dayKey(new Date());
          return (
            <div
              key={i}
              className={`schedule-date-cell ${state ? `is-${state}` : ""} ${joinBefore ? "join-before" : ""} ${joinAfter ? "join-after" : ""}`}
            >
              <button
                type="button"
                disabled={busy}
                aria-current={today ? "date" : undefined}
                aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${appointments.length ? `${appointments.length} ${state === "past" ? "past " : ""}appointment${appointments.length === 1 ? "" : "s"}` : "no confirmed appointments"}`}
                onClick={(event) => onDay(date, event)}
              >
                <span>{day}</span>
                {appointments.length > 1 && (
                  <small>{appointments.length}</small>
                )}
              </button>
            </div>
          );
        })}
      </div>
      <div className="schedule-legend">
        <span>
          <i />
          Booked
        </span>
        <span>
          <i className="is-past" />
          Past
        </span>
        <p>Choose a date to view or plan your day.</p>
      </div>
    </section>
  );
}
