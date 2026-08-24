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
      <FactRow k="Allergy" v="Penicillin" src="clinician" />
      <FactRow k="Condition" v="Asthma — provisional" src="ai" />
      <FactRow k="Medication" v="Salbutamol inhaler PRN" src="clinician" />
      <FactRow k="Blood group" v="O+" src="self" />
    </div>
  );
}
