"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { MiniRow, RowIcon } from "@/components/ui/fact-row";
import { StatusBadge } from "@/components/ui/badge";
import { TYPE_META } from "@/features/timeline/model";
import { useTimelineStore } from "@/features/timeline/store";

export function RecordTabsCard() {
  const events = useTimelineStore((s) => s.events);
  const openEvidence = useTimelineStore((s) => s.openEvidence);

  return (
    <div className="card">
      <Tabs.Root defaultValue="Timeline">
        <Tabs.List
          className="pills"
          aria-label="Record sections"
          style={{ marginBottom: 12, marginTop: 0 }}
        >
          {["Timeline", "Vitals"].map((t) => (
            <Tabs.Trigger key={t} value={t} className="pill pill-tiny">
              {t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="Timeline">
          {events.length > 0 ? (
            events.map((ev) => {
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
            })
          ) : (
            <div
              className="small"
              style={{ padding: 12, color: "var(--ink2)", textAlign: "center" }}
            >
              No timeline events recorded.
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="Vitals">
          <div className="vitalhead">
            <b className="vnum">--</b>
            <span className="small">bpm · no vital stream active</span>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
