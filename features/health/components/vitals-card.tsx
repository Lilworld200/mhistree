"use client";

import { AreaSparkline } from "@/components/ui/area-sparkline";
import { Label } from "@/components/ui/label";
import { HR_DATA } from "../data/seed";

export function VitalsCard() {
  return (
    <div className="card">
      <Label
        right={
          <span className="badge">
            <i className="badge-dot" style={{ background: "#8A63D2" }} />
            Device
          </span>
        }
      >
        Resting heart rate
      </Label>
      <div className="vitalhead">
        <b className="vnum">79</b>
        <span className="small">bpm · latest</span>
        <span className="badge" style={{ color: "var(--amber)" }}>
          <i className="badge-dot" style={{ background: "var(--amber)" }} />
          1 spike this week
        </span>
      </div>
      <AreaSparkline data={HR_DATA} gradientId="health-hr-gradient" height={74} />
    </div>
  );
}
