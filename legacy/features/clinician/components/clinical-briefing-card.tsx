"use client";

import { Label } from "@/components/ui/label";

export function ClinicalBriefingCard() {
  return (
    <div className="card">
      <Label
        right={
          <span className="badge" style={{ color: "var(--amber)" }}>
            <i className="badge-dot" style={{ background: "var(--amber)" }} />
            AI Reasoning
          </span>
        }
      >
        AI clinical briefing
      </Label>
      <div
        className="card card-inset small"
        style={{ padding: 20, textAlign: "center", color: "var(--ink2)" }}
      >
        No longitudinal clinical briefing generated for this record yet. Select
        a patient or record timeline facts to trigger AI analysis.
      </div>
    </div>
  );
}
