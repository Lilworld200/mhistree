"use client";

import { FactRow } from "@/components/ui/fact-row";
import { Label } from "@/components/ui/label";

export function BaselineCard({ onViewAll }: { onViewAll: () => void }) {
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
      <FactRow k="Allergies" v="None recorded" src="clinician" />
      <FactRow k="Conditions" v="None recorded" src="ai" />
      <FactRow k="Medications" v="None recorded" src="clinician" />
      <FactRow k="Blood group" v="Not specified" src="self" />
    </div>
  );
}
