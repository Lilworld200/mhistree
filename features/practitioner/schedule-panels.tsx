"use client";
import { useState } from "react";
import { SidePanel } from "@/components/ui/side-panel";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import type { Appointment } from "./daily-types";
import { isCareAccessError, careTime } from "./daily-types";

export function AvailabilityPanel({
  onClose,
  onSaved,
  returnFocus,
  onAccessLost,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  returnFocus: () => HTMLElement | null;
  onAccessLost: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <SidePanel
      title="Add availability"
      description="Choose a time when patients can request an appointment."
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <div className="sharing-panel-body">
        <form
          className="account-form practitioner-panel-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setBusy(true);
            setError("");
            try {
              const start = new Date(String(form.get("start"))),
                end = new Date(String(form.get("end")));
              if (
                start <= new Date() ||
                end <= start ||
                end.getTime() - start.getTime() > 86400000
              )
                throw new Error("VALIDATION_FAILED");
              await api("/api/practitioner/today", {
                action: "add",
                data: {
                  startsAt: start.toISOString(),
                  endsAt: end.toISOString(),
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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
            Start
            <input
              name="start"
              type="datetime-local"
              required
              disabled={busy}
            />
          </label>
          <label>
            End
            <input name="end" type="datetime-local" required disabled={busy} />
          </label>
          <p className="sharing-help">
            Times use your device’s timezone. Choose a future interval of up to
            24 hours. Overlapping availability is checked when saving.
          </p>
          <Btn kind="dark" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save availability"}
          </Btn>
        </form>
        {error && <p role="alert">{error}</p>}
      </div>
    </SidePanel>
  );
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
              <option value="reschedule">Propose a new time</option>
              <option value="cancel">Cancel appointment</option>
            </select>
          </label>
          {action === "reschedule" && (
            <>
              <label>
                New start
                <input
                  name="start"
                  type="datetime-local"
                  required
                  disabled={busy}
                />
              </label>
              <label>
                New end
                <input
                  name="end"
                  type="datetime-local"
                  required
                  disabled={busy}
                />
              </label>
              <p className="sharing-help">
                Use a future interval of up to 8 hours in your device’s
                timezone. Rescheduling returns the appointment to requested
                status.
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
