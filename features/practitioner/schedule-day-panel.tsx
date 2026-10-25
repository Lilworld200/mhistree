"use client";
import { useState } from "react";
import { SidePanel } from "@/components/ui/side-panel";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import {
  careTime,
  careState,
  isCareAccessError,
  type Today,
} from "./daily-types";
import { localInput } from "./schedule-panels";
import type { CalendarAppointment } from "./schedule-calendar";

export function ScheduleDayPanel({
  date,
  asOf,
  rows,
  data,
  canManage,
  onManage,
  onSaved,
  onClose,
  onAccessLost,
  returnFocus,
}: {
  date: Date;
  asOf: number;
  rows: CalendarAppointment[];
  data: Today;
  canManage: boolean;
  onManage: (row: CalendarAppointment) => void;
  onSaved: () => Promise<void>;
  onClose: () => void;
  onAccessLost: (e: unknown) => void;
  returnFocus: () => HTMLElement | null;
}) {
  const [mode, setMode] = useState("appointment"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestKey] = useState(() => crypto.randomUUID());
  const [remove, setRemove] = useState<string | null>(null);
  const [editSlot, setEditSlot] = useState<
    Today["availability"][number] | null
  >(null);
  const slots = data.availability.filter(
    (slot) => new Date(slot.starts_at).toDateString() === date.toDateString(),
  );
  const past =
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) <=
    new Date(asOf);
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    9,
  );
  if (
    date.toDateString() === new Date(asOf).toDateString() &&
    start.getTime() <= asOf
  ) {
    start.setTime(Math.ceil((asOf + 60000) / 1800000) * 1800000);
  }
  const end = new Date(start.getTime() + 1800000);
  async function mutation(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await onSaved();
      onClose();
    } catch (e) {
      if (isCareAccessError(e)) onAccessLost(e);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SidePanel
      className="schedule-panel"
      title={date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })}
      description="Appointments and schedule · device timezone"
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <div className="sharing-panel-body">
        {rows.length > 0 && (
          <div className="schedule-day-list">
            {rows.map((row) => (
              <article className="schedule-day-booking" key={row.id}>
                <span className="badge">{careState(row.state)}</span>
                <h3>{row.patientName}</h3>
                <p>
                  {careTime(row.starts_at, row.timezone)} –{" "}
                  {careTime(row.ends_at, row.timezone)}
                </p>
                {row.timezone && <p className="sharing-help">{row.timezone}</p>}
                {canManage &&
                  ["accepted", "requested"].includes(row.state) &&
                  Date.parse(row.ends_at) > asOf && (
                    <Btn sm onClick={() => onManage(row)}>
                      Manage appointment
                    </Btn>
                  )}
              </article>
            ))}
          </div>
        )}
        {slots.map((slot) => (
          <article className="schedule-day-booking" key={slot.id}>
            <h3>Available for requests</h3>
            <p>
              {careTime(slot.starts_at, slot.timezone)} –{" "}
              {careTime(slot.ends_at, slot.timezone)}
            </p>
            {canManage && (
              <div className="sharing-card-actions">
                <Btn
                  sm
                  disabled={busy}
                  onClick={() => {
                    setMode("availability");
                    setEditSlot(slot);
                  }}
                >
                  Edit time
                </Btn>
                <Btn
                  sm
                  disabled={busy}
                  onClick={() => {
                    if (remove !== slot.id) {
                      setRemove(slot.id);
                      return;
                    }
                    void mutation(() =>
                      api("/api/practitioner/today", {
                        action: "remove",
                        data: { id: slot.id, version: slot.version },
                      }),
                    );
                  }}
                >
                  {remove === slot.id ? "Confirm removal" : "Remove slot"}
                </Btn>
                {remove === slot.id && (
                  <Btn sm onClick={() => setRemove(null)}>
                    Keep slot
                  </Btn>
                )}
              </div>
            )}
            {remove === slot.id && (
              <p className="sharing-help">
                Remove this availability? Existing appointments remain
                unchanged.
              </p>
            )}
          </article>
        ))}
        {past ? (
          <p className="sharing-help">
            Past appointments remain in your history. Choose a future date to
            add a schedule.
          </p>
        ) : canManage ? (
          <>
            <h3 className="schedule-form-title">
              {rows.length || slots.length
                ? "Add to this day"
                : "Plan this day"}
            </h3>
            <nav className="sharing-tabs" aria-label="Schedule type">
              <button
                className={`pill ${mode === "appointment" ? "on" : ""}`}
                aria-pressed={mode === "appointment"}
                onClick={() => {
                  setMode("appointment");
                  setEditSlot(null);
                }}
              >
                Appointment
              </button>
              <button
                className={`pill ${mode === "availability" ? "on" : ""}`}
                aria-pressed={mode === "availability"}
                onClick={() => setMode("availability")}
              >
                Availability
              </button>
            </nav>
            <form
              key={`${mode}:${editSlot?.id ?? "new"}`}
              className="account-form practitioner-panel-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutation(async () => {
                  const startsAt = new Date(String(form.get("start"))),
                    endsAt = new Date(String(form.get("end")));
                  if (
                    startsAt <= new Date() ||
                    endsAt <= startsAt ||
                    endsAt.getTime() - startsAt.getTime() >
                      (mode === "appointment" ? 8 : 24) * 3600000
                  )
                    throw new Error("VALIDATION_FAILED");
                  const slot = {
                    startsAt: startsAt.toISOString(),
                    endsAt: endsAt.toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  };
                  if (mode === "availability")
                    return api("/api/practitioner/today", {
                      action: editSlot ? "update" : "add",
                      data: {
                        ...slot,
                        ...(editSlot
                          ? { id: editSlot.id, version: editSlot.version }
                          : {}),
                      },
                    });
                  const connectionId = String(form.get("patient"));
                  return api("/api/practitioner/workspace", {
                    connectionId,
                    action: "appointment-create",
                    data: { connectionId, requestKey, slot },
                  });
                });
              }}
            >
              {mode === "appointment" && (
                <label>
                  Patient
                  <select name="patient" required disabled={busy}>
                    <option value="">Choose a connected patient</option>
                    {data.items.map((item) => (
                      <option value={item.connectionId} key={item.connectionId}>
                        {item.patientName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Start
                <input
                  name="start"
                  type="datetime-local"
                  required
                  disabled={busy}
                  defaultValue={localInput(
                    editSlot?.starts_at ?? start.toISOString(),
                  )}
                />
              </label>
              <label>
                End
                <input
                  name="end"
                  type="datetime-local"
                  required
                  disabled={busy}
                  defaultValue={localInput(
                    editSlot?.ends_at ?? end.toISOString(),
                  )}
                />
              </label>
              <p className="sharing-help">
                {Intl.DateTimeFormat().resolvedOptions().timeZone} ·{" "}
                {mode === "appointment"
                  ? "Up to 8 hours. Patient names come from your connected records."
                  : "Up to 24 hours. Patients can request these times."}
              </p>
              {mode === "appointment" && !data.items.length && (
                <p className="sharing-help">
                  Connect a patient in My patients before booking an
                  appointment.
                </p>
              )}
              <Btn
                kind="dark"
                type="submit"
                disabled={
                  busy || (mode === "appointment" && !data.items.length)
                }
              >
                {busy
                  ? "Saving…"
                  : mode === "appointment"
                    ? "Create appointment"
                    : editSlot
                      ? "Save availability changes"
                      : "Save availability"}
              </Btn>
            </form>
          </>
        ) : (
          <p className="sharing-help">
            Your professional permissions do not include managing appointments.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </SidePanel>
  );
}
