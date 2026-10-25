"use client";
import { useState } from "react";
import { SidePanel } from "@/components/ui/side-panel";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import type { Appointment } from "./daily-types";
import { isCareAccessError, careTime } from "./daily-types";

export function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function AppointmentPanel({
  appointment,
  patientName,
  connectionId,
  onClose,
  onSaved,
  returnFocus,
  onAccessLost,
}: {
  appointment: Appointment;
  patientName: string;
  connectionId: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  returnFocus: () => HTMLElement | null;
  onAccessLost: (error: unknown) => void;
}) {
  const [action, setAction] = useState(
      appointment.state === "requested" ? "accept" : "reschedule",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <SidePanel
      className="schedule-panel"
      title="Manage appointment"
      description={patientName}
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <div className="sharing-panel-body">
        <p className="sharing-help">
          {careTime(appointment.starts_at, appointment.timezone)} –{" "}
          {careTime(appointment.ends_at, appointment.timezone)}
          {appointment.timezone ? ` · ${appointment.timezone}` : ""}
        </p>
        <form
          className="account-form practitioner-panel-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              const slot =
                action === "reschedule"
                  ? {
                      startsAt: new Date(
                        String(form.get("start")),
                      ).toISOString(),
                      endsAt: new Date(String(form.get("end"))).toISOString(),
                      timezone:
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                    }
                  : undefined;
              await api("/api/practitioner/workspace", {
                connectionId,
                action: "appointment",
                data: {
                  id: appointment.id,
                  version: appointment.version,
                  action,
                  ...(slot ? { slot } : {}),
                },
              });
              await onSaved();
              onClose();
            } catch (e) {
              if (isCareAccessError(e)) onAccessLost(e);
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Action
            <select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              disabled={busy}
            >
              {appointment.state === "requested" && (
                <>
                  <option value="accept">Accept appointment</option>
                  <option value="decline">Decline appointment</option>
                </>
              )}
              <option value="reschedule">
                {appointment.state === "accepted"
                  ? "Change date or time"
                  : "Propose a new time"}
              </option>
              <option value="cancel">Cancel appointment</option>
            </select>
          </label>
          {action === "reschedule" && (
            <>
              <label>
                New start
                <input
                  defaultValue={localInput(appointment.starts_at)}
                  name="start"
                  type="datetime-local"
                  required
                  disabled={busy}
                />
              </label>
              <label>
                New end
                <input
                  defaultValue={localInput(appointment.ends_at)}
                  name="end"
                  type="datetime-local"
                  required
                  disabled={busy}
                />
              </label>
              <p className="sharing-help">
                Use a future interval of up to 8 hours in your device’s
                timezone. Confirmed appointments stay confirmed when you move
                them; requests remain pending until accepted.
              </p>
            </>
          )}
          {(action === "cancel" || action === "decline") && (
            <label className="practitioner-confirm">
              <input type="checkbox" required disabled={busy} />
              Confirm that you want to {action} this appointment.
            </label>
          )}
          <Btn kind="dark" type="submit" disabled={busy}>
            {busy ? "Updating…" : "Confirm appointment update"}
          </Btn>
        </form>
        {error && <p role="alert">{error}</p>}
      </div>
    </SidePanel>
  );
}
