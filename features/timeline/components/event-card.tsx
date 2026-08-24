"use client";

import { Icon } from "@/components/ui/icons";
import { ProvBadge, StatusBadge } from "@/components/ui/badge";
import { TYPE_META, type TimelineEvent } from "../model";
import { useTimelineStore } from "../store";

export function EventCard({ ev }: { ev: TimelineEvent }) {
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  const meta = TYPE_META[ev.type];
  return (
    <button className="card evcard" onClick={() => openEvidence(ev.id)}>
      <span
        className="tic"
        style={{ background: (meta?.c ?? "#666") + "22", color: meta?.c }}
      >
        <Icon n={meta?.icon ?? "pulse"} s={17} />
      </span>
      <span className="evmain">
        <b>{ev.title}</b>
        <span className="evwhen">{ev.when}</span>
        <span className="evdesc ell2">{ev.desc}</span>
        <span className="evbadges">
          <ProvBadge src={ev.src} />
          <StatusBadge st={ev.status} />
        </span>
      </span>
      <Icon n="chev" s={16} />
    </button>
  );
}
