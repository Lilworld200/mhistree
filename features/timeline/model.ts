import type { IconName } from "@/components/ui/icons";

/* ── Clinical ledger domain model ─────────────────────────────── */

export type ProvenanceSource = "self" | "device" | "lab" | "clinician" | "ai";

export type VerificationStatus =
  | "verified"
  | "reported"
  | "inferred"
  | "corrected"
  | "disputed"
  | "rejected";

export type EventType =
  | "Symptom"
  | "Medication"
  | "Condition"
  | "Vital"
  | "Lab"
  | "Visit"
  | "Document";

export const TYPE_META: Record<EventType, { icon: IconName; c: string }> = {
  Symptom: { icon: "thermo", c: "#478BEE" },
  Medication: { icon: "cross", c: "#8A63D2" },
  Condition: { icon: "heart", c: "#D96459" },
  Vital: { icon: "pulse", c: "#2F8F5B" },
  Lab: { icon: "drop", c: "#C08A2D" },
  Visit: { icon: "cal", c: "#181818" },
  Document: { icon: "doc", c: "#6E6E6E" },
};

export interface EventCorrection {
  note: string;
  at: string;
}

export interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  when: string;
  ts: number;
  desc: string;
  src: ProvenanceSource;
  status: VerificationStatus;
  ep?: string;
  session?: string;
  docId?: string;
  sourceMsg: string;
  verifiedBy?: string;
  verifiedAt?: string;
  /** AI support level 0–100. Display uses Low/Moderate/High bands only — never fake precision percentages in clinical UI (see idea_scaffold.md §31). */
  support?: number;
  corrections?: EventCorrection[];
}

export interface Episode {
  id: string;
  title: string;
  span: string;
  count: number;
  trend?: string;
  summary: string;
  eventIds: string[];
}

export function supportBand(support: number): "Low" | "Moderate" | "High" {
  if (support >= 70) return "High";
  if (support >= 40) return "Moderate";
  return "Low";
}

/* ── Filter configurations ────────────────────────────────────── */

export interface FilterOption<T> {
  label: string;
  value: T | null;
}

export const TL_TYPE_FILTERS: FilterOption<EventType>[] = [
  { label: "All", value: null },
  { label: "Symptoms", value: "Symptom" },
  { label: "Medications", value: "Medication" },
  { label: "Conditions", value: "Condition" },
  { label: "Vitals", value: "Vital" },
  { label: "Labs", value: "Lab" },
  { label: "Visits", value: "Visit" },
  { label: "Documents", value: "Document" },
];

export const TL_SRC_FILTERS: FilterOption<ProvenanceSource>[] = [
  { label: "All", value: null },
  { label: "Reported by me", value: "self" },
  { label: "Clinician verified", value: "clinician" },
  { label: "Laboratory", value: "lab" },
  { label: "Device", value: "device" },
  { label: "AI inferred", value: "ai" },
];
