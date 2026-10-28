export type Appointment = {
  id: string;
  version: number;
  starts_at: string;
  ends_at: string;
  state: string;
  timezone?: string;
};
export type DailyItem = {
  connectionId: string;
  patientName: string;
  unread: number;
  appointments: Appointment[];
  upcomingAppointment?: Appointment | null;
  requests: {
    id: string;
    service_name: string;
    state: string;
    result_event_id?: string | null;
  }[];
  reminders: { id: string; body: { text: string }; due_at: string | null }[];
};
export type Today = {
  items: DailyItem[];
  availability: {
    id: string;
    starts_at: string;
    ends_at: string;
    version: number;
    timezone?: string;
  }[];
  notifications: {
    id: string;
    kind: string;
    created_at: string;
    connection_id?: string | null;
  }[];
  limited: boolean;
};
export type DailyView = "dashboard" | "schedule" | "inbox" | "requests";
export const careStateLabels: Record<string, string> = {
  requested: "Requested",
  accepted: "Accepted",
  "in-progress": "In progress",
  performed: "Performed",
  "result-draft": "Result draft",
  finalized: "Finalized",
  cancelled: "Cancelled",
  paused: "Paused",
  declined: "Declined",
};
export function careState(value: string) {
  return careStateLabels[value] ?? "Status unavailable";
}
export function careTime(value: string, timezone?: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timezone ? { timeZone: timezone } : {}),
  }).format(new Date(value));
}
export const patientWorkspace = (connectionId: string, section?: string) =>
  section === "care-text-inbox"
    ? `/clinician/inbox?connection=${connectionId}`
    : `/clinician/patients/${connectionId}${section ? `#${section}` : ""}`;
export function isCareAccessError(error: unknown) {
  return (
    error instanceof Error &&
    [
      "AUTH_REQUIRED",
      "SESSION_RETIRED",
      "ACCESS_DENIED",
      "ACCESS_REVOKED",
    ].includes(error.message)
  );
}
