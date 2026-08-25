"use client";

import { Label } from "@/components/ui/label";

export function VitalsCard() {
  return (
    <div className="card">
      <Label
        right={
          <span className="badge">
            <i className="badge-dot" style={{ background: "#8A63D2" }} />
            Sync
          </span>
        }
      >
        Vitals Monitoring
      </Label>
      <div className="vitalhead">
        <b className="vnum">--</b>
        <span className="small">bpm · no active device connection</span>
      </div>
      <div
        className="card card-inset small"
        style={{
          padding: 16,
          marginTop: 12,
          textAlign: "center",
          color: "var(--ink2)",
        }}
      >
        No vitals readings synced from device or Supabase.
      </div>
    </div>
  );
}
