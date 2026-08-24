"use client";

import { Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { MiniRow } from "@/components/ui/fact-row";

export function UpcomingCard() {
  return (
    <div className="card">
      <Label>Upcoming</Label>
      <MiniRow>
        <RowIconStatic icon="cal" bg="#18181814" color="#181818" />
        <span>
          <b>Spirometry — Central Clinic</b>
          <span className="small block">28 Aug · 10:30 AM · Dr. Emeka Obi</span>
        </span>
      </MiniRow>
      <MiniRow>
        <RowIconStatic icon="chat" bg="#478BEE22" color="#478BEE" />
        <span>
          <b>Weekly reflection</b>
          <span className="small block">
            Mhistree will summarise your week on Sunday
          </span>
        </span>
      </MiniRow>
    </div>
  );
}

function RowIconStatic({ icon, bg, color }: { icon: "cal" | "chat"; bg: string; color: string }) {
  return (
    <span className="tic tic-sm" style={{ background: bg, color }}>
      <Icon n={icon} s={14} />
    </span>
  );
}
