"use client";

import { FactRow } from "@/components/ui/fact-row";
import { Label } from "@/components/ui/label";

export interface BaselineData {
  allergies?: string | null;
  conditions?: string | null;
  medications?: string | null;
  bloodGroup?: string | null;
  /** Resolved-condition history entries, newest first. */
  resolved?: { name: string; resolvedAt: string }[] | null;
}

/** Strip API title formatting ("Medication: Drug (500mg)") to a clean label. */
export const cleanMedLabel = (title: string) =>
  title.replace(/^Medication:\s*/i, "").replace(/\s*\([^)]*\)\s*$/, "");

export function BaselineCard({
  data,
  onViewAll,
}: {
  data: BaselineData;
  onViewAll: () => void;
}) {
  const resolvedLabel =
    data.resolved && data.resolved.length > 0
      ? data.resolved
          .slice(0, 3)
          .map(
            (r) =>
              `${r.name} (${new Date(r.resolvedAt).toLocaleDateString()})`,
          )
          .join(", ")
      : null;

  return (
    <div className="card">
      <Label
        right={
          <button className="link" onClick={onViewAll}>
            View all
          </button>
        }
      >
        Medical baseline
      </Label>
      <FactRow k="Allergies" v={data.allergies || "None recorded"} src="clinician" />
      <FactRow k="Conditions" v={data.conditions || "None recorded"} src="ai" />
      <FactRow k="Medications" v={data.medications || "None recorded"} src="ai" />
      <FactRow k="Blood group" v={data.bloodGroup || "Not specified"} src="self" />
      <FactRow
        k="Resolved"
        v={resolvedLabel || "No resolved history"}
        src="ai"
      />
    </div>
  );
}
