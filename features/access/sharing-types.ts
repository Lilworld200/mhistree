export type Connection = {
  id: string;
  kind: "direct" | "organization";
  status: "active" | "pending" | "revoked";
  revision: number;
  patient_approved?: boolean;
  practitioner_approved?: boolean;
  display_name: string;
  practitioner_account_id: string | null;
  categories: string[] | null;
  exclusions: string[] | null;
  method: string | null;
  recorded_at: string | null;
};
export type Practitioner = {
  id: string;
  display_name: string;
  profession: string;
  jurisdiction: string;
};
export type Controls = {
  connections: Connection[];
  requests: { id: string; kind: string; state: string; created_at: string }[];
};
export type HistoryEvent = {
  id: string;
  action: string;
  recorded_at: string;
  actor_name: string;
  connection_name: string | null;
  context_label: string;
};
export type HistoryPage = {
  items: HistoryEvent[];
  nextCursor: { at: string; id: string } | null;
};
export const categoryLabels: Record<string, string> = {
  symptom: "Symptoms",
  activity: "Activities",
  "medication-use": "Medication use",
  allergy: "Allergies",
  baseline: "Baseline health",
  ongoing: "Ongoing issues",
  document: "Documents",
  clinical: "Clinical entries",
  prescription: "Prescriptions",
  result: "Test results",
};
export function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
