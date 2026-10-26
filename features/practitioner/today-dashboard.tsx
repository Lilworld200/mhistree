"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { dateLabel } from "@/features/access/sharing-types";
import { patientWorkspace, type Today } from "./daily-types";
import { useCareNotifications } from "./notification-context";
import { NotificationDot } from "@/components/ui/notification-dot";

export function TodayDashboard({
  data,
  busy,
  onRefresh,
}: {
  data: Today;
  busy: boolean;
  onRefresh: () => void;
}) {
  const [remindersOpen, setRemindersOpen] = useState(false);
  const remindersId = useId();
  const { snapshot, ready } = useCareNotifications();
  const hasMessages = ready
    ? snapshot.connections.some((c) => c.unread > 0)
    : data.items.some((c) => c.unread > 0);
  const activities = [...data.notifications].sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) ||
      a.id.localeCompare(b.id),
  );
  const reminders = data.items
    .flatMap((item) =>
      item.reminders.map((reminder) => ({
        ...reminder,
        connectionId: item.connectionId,
        patientName: item.patientName,
      })),
    )
    .sort((a, b) => {
      if (a.due_at === null && b.due_at !== null) return 1;
      if (b.due_at === null && a.due_at !== null) return -1;
      return (
        (a.due_at && b.due_at
          ? Date.parse(a.due_at) - Date.parse(b.due_at)
          : 0) || a.id.localeCompare(b.id)
      );
    });
  function activityRow(item: Today["notifications"][number]) {
    const patient = data.items.find(
      (row) => row.connectionId === item.connection_id,
    );
    return (
      <li className="daily-row" key={item.id}>
        <span className="daily-row-icon">
          <Icon
            n={
              item.kind === "message"
                ? "chat"
                : item.kind === "appointment"
                  ? "cal"
                  : "doc"
            }
          />
        </span>
        <div className="daily-row-main">
          <h3>
            {{
              message: "Care message update",
              appointment: "Appointment update",
              request: "Service request update",
            }[item.kind] ?? "Care activity"}
          </h3>
          {patient && <p>{patient.patientName}</p>}
          <time dateTime={item.created_at}>{dateLabel(item.created_at)}</time>
          {item.connection_id && (
            <Link
              href={patientWorkspace(
                item.connection_id,
                item.kind === "message"
                  ? "care-text-inbox"
                  : item.kind === "request"
                    ? "requests-results"
                    : undefined,
              )}
            >
              Open care context
            </Link>
          )}
        </div>
      </li>
    );
  }
  return (
    <>
      <div className="daily-dashboard-toolbar">
        <nav className="daily-shortcuts" aria-label="Care workspaces">
          {(
            [
              ["/clinician/schedule", "Schedule", "cal"],
              ["/clinician/inbox", "Care inbox", "chat"],
              ["/clinician/requests", "Requests & results", "doc"],
            ] as const
          ).map(([href, label, icon]) => (
            <Btn sm asChild key={href} icon={icon}>
              <Link href={href}>
                {label}
                {href === "/clinician/inbox" && hasMessages && (
                  <NotificationDot />
                )}
              </Link>
            </Btn>
          ))}
        </nav>
        <Btn
          className="daily-desktop-refresh"
          sm
          icon="clock"
          disabled={busy}
          onClick={onRefresh}
        >
          {busy ? "Refreshing…" : "Refresh"}
        </Btn>
      </div>
      <div className="daily-connected-card">
        <section
          className="hero daily-activity"
          aria-label="Today's care updates"
        >
          <div className="daily-activity-heading">
            <div className="daily-dashboard-title">
              <h1 className="ptitle">Today</h1>
              <p>Recent care updates and your private reminders.</p>
            </div>
          </div>

          {activities.length ? (
            <>
              <div
                className="daily-activity-list"
                role="region"
                aria-label="Recent care updates"
                tabIndex={0}
              >
                <ul className="daily-feed">{activities.map(activityRow)}</ul>
              </div>
            </>
          ) : (
            <div className="daily-activity-empty">
              <h3>No recent activity</h3>
              <p>Updates from your direct care connections will appear here.</p>
            </div>
          )}
          <svg
            className="daily-monitor-trace"
            viewBox="0 0 640 100"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M0 58H115L132 51L146 58H184L200 38L218 78L240 12L263 91L283 45L302 58H360L376 51L393 58H640" />
          </svg>
        </section>
        <section
          className="daily-reminders"
          aria-labelledby={`${remindersId}-title`}
        >
          <h2 id={`${remindersId}-title`}>
            <button
              type="button"
              className="daily-drawer-toggle"
              aria-expanded={remindersOpen}
              aria-controls={remindersId}
              onClick={() => setRemindersOpen(!remindersOpen)}
            >
              <span className="daily-drawer-grip" aria-hidden="true" />
              <span>Reminders</span>
              <span className="daily-reminder-count">{reminders.length}</span>
              <Icon n="chev" />
            </button>
          </h2>
          <div
            className="daily-disclosure"
            data-open={remindersOpen}
            id={remindersId}
            aria-hidden={!remindersOpen}
            inert={!remindersOpen}
          >
            <div className="daily-disclosure-inner">
              <div
                className="daily-reminder-list"
                role="region"
                aria-label="Your reminders"
                tabIndex={0}
              >
                {reminders.length ? (
                  <ul className="daily-feed">
                    {reminders.map((reminder) => (
                      <li className="daily-row" key={reminder.id}>
                        <div className="daily-row-main">
                          <span className="daily-private-label">Private</span>
                          <h3>{reminder.patientName}</h3>
                          <p>{reminder.body.text}</p>
                          {reminder.due_at ? (
                            <time dateTime={reminder.due_at}>
                              Due {dateLabel(reminder.due_at)}
                            </time>
                          ) : (
                            <span className="daily-undated">No due date</span>
                          )}
                          <Link
                            href={patientWorkspace(
                              reminder.connectionId,
                              "private-work",
                            )}
                          >
                            Open private work
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="daily-empty">
                    <h3>No reminders</h3>
                    <p>
                      Manage your author-only reminders in the patient
                      workspace.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
