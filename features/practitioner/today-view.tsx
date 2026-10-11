"use client";
import { useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Today = {
  items: {
    connectionId: string;
    patientName: string;
    unread: number;
    appointments: {
      id: string;
      version: number;
      starts_at: string;
      ends_at: string;
      state: string;
    }[];
    requests: { id: string; service_name: string; state: string }[];
    reminders: { id: string; body: { text: string }; due_at: string | null }[];
  }[];
  availability: {
    id: string;
    starts_at: string;
    ends_at: string;
    version: number;
  }[];
  notifications: { id: string; kind: string; created_at: string }[];
  limited: boolean;
};
export function TodayView({ initial }: { initial: Today }) {
  const [data, setData] = useState<Today | null>(initial),
    [message, setMessage] = useState("");
  async function reload() {
    try {
      setData(await api<Today>("/api/practitioner/today"));
    } catch (e) {
      setData(null);
      setMessage(errorMessage(e));
    }
  }
  return (
    <section className="patient-page">
      <h1>Today and upcoming care</h1>
      <Link href="/clinician/patients">My patients and connections</Link> ·{" "}
      <Link href="/clinician/profile">Professional profile</Link>
      <p role="status">{message}</p>
      <Btn onClick={() => void reload()}>Refresh current access</Btn>
      {data?.items.map((item) => (
        <article className="record-card" key={item.connectionId}>
          <h2>{item.patientName}</h2>
          <Link href={`/clinician/patients/${item.connectionId}`}>
            Open direct workspace and inbox ({item.unread} unread)
          </Link>
          {item.appointments.map((a) => (
            <form
              className="account-form"
              key={a.id}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  await api("/api/practitioner/workspace", {
                    connectionId: item.connectionId,
                    action: "appointment",
                    data: {
                      id: a.id,
                      version: a.version,
                      action: f.get("action"),
                      ...(f.get("action") === "reschedule"
                        ? {
                            slot: {
                              startsAt: new Date(
                                String(f.get("start")),
                              ).toISOString(),
                              endsAt: new Date(
                                String(f.get("end")),
                              ).toISOString(),
                              timezone:
                                Intl.DateTimeFormat().resolvedOptions()
                                  .timeZone,
                            },
                          }
                        : {}),
                    },
                  });
                  await reload();
                } catch (error) {
                  setMessage(errorMessage(error));
                }
              }}
            >
              <p>
                {new Date(a.starts_at).toLocaleString()} · {a.state}
              </p>
              <select name="action" aria-label="Appointment action">
                <option>accept</option>
                <option>decline</option>
                <option>reschedule</option>
                <option>cancel</option>
              </select>
              <label>
                New start for reschedule
                <input type="datetime-local" name="start" />
              </label>
              <label>
                New end for reschedule
                <input type="datetime-local" name="end" />
              </label>
              <Btn type="submit">Update appointment</Btn>
            </form>
          ))}
          {item.requests.map((r) => (
            <p key={r.id}>
              {r.service_name}: {r.state}
            </p>
          ))}
          {item.reminders.map((r) => (
            <p key={r.id}>
              Reminder: {r.body.text}{" "}
              {r.due_at ? new Date(r.due_at).toLocaleString() : ""}
            </p>
          ))}
        </article>
      ))}
      <h2>Availability</h2>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("/api/practitioner/today", {
              action: "add",
              data: {
                startsAt: new Date(String(f.get("start"))).toISOString(),
                endsAt: new Date(String(f.get("end"))).toISOString(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            });
            await reload();
          } catch (err) {
            setMessage(errorMessage(err));
          }
        }}
      >
        <label>
          Start
          <input name="start" type="datetime-local" required />
        </label>
        <label>
          End
          <input name="end" type="datetime-local" required />
        </label>
        <Btn type="submit">Add availability</Btn>
      </form>
      {data?.availability.map((a) => (
        <article key={a.id}>
          <p>
            {new Date(a.starts_at).toLocaleString()} –{" "}
            {new Date(a.ends_at).toLocaleString()}
          </p>
          <Btn
            onClick={async () => {
              try {
                await api("/api/practitioner/today", {
                  action: "remove",
                  data: { id: a.id, version: a.version },
                });
                await reload();
              } catch (e) {
                setMessage(errorMessage(e));
              }
            }}
          >
            Remove slot
          </Btn>
        </article>
      ))}
      <h2>Notifications</h2>
      {data?.notifications.map((n) => (
        <p key={n.id}>
          {n.kind} update · {new Date(n.created_at).toLocaleString()}
        </p>
      ))}
      <p>
        Notifications are durable in-app events. Email delivery is not
        represented as completed. Unread messages do not prove clinical work
        completion.
      </p>
    </section>
  );
}
