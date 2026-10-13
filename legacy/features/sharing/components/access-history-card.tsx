"use client";

import { Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { MiniRow } from "@/components/ui/fact-row";
import { Reveal } from "@/components/ui/reveal";
import { useSharingStore } from "../store";

export function AccessHistoryCard() {
  const accessLog = useSharingStore((s) => s.accessLog);
  return (
    <Reveal d={0.12}>
      <div className="card">
        <Label>Access history</Label>
        {accessLog.slice(0, 6).map((a, i) => (
          <MiniRow key={i}>
            <span
              className="tic tic-sm"
              style={{ background: "#2F8F5B22", color: "#2F8F5B" }}
            >
              <Icon n="shield" s={14} />
            </span>
            <span>
              <b>{a.actor}</b> <span className="small">{a.action}</span>
              <span className="small block">
                {a.at} · {a.purpose}
              </span>
            </span>
          </MiniRow>
        ))}
      </div>
    </Reveal>
  );
}
