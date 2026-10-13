"use client";

import { MiniRow, RowIcon } from "@/components/ui/fact-row";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/badge";
import { TYPE_META } from "@/features/timeline/model";
import type { TimelineEvent } from "@/features/timeline/model";
import { useTimelineStore } from "@/features/timeline/store";

export function RecentActivityCard({
  events,
  onOpenTimeline,
}: {
  events: TimelineEvent[];
  onOpenTimeline: () => void;
}) {
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  return (
    <div className="card">
      <Label
        right={
          <button className="link" onClick={onOpenTimeline}>
            Open timeline
          </button>
        }
      >
        Recent activity
      </Label>
      {events.map((ev) => {
        const meta = TYPE_META[ev.type];
        return (
          <MiniRow key={ev.id} onClick={() => openEvidence(ev.id)}>
            <RowIcon
              icon={meta?.icon ?? "pulse"}
              color={meta?.c ?? "#666"}
              bg={(meta?.c ?? "#666") + "22"}
              sm
            />
            <span className="ell">
              <b>{ev.title}</b>
              <span className="small block">{ev.when}</span>
            </span>
            <StatusBadge st={ev.status} />
          </MiniRow>
        );
      })}
    </div>
  );
}
