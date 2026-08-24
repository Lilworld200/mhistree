"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { MiniRow, RowIcon } from "@/components/ui/fact-row";
import { StatusBadge } from "@/components/ui/badge";
import { AreaSparkline } from "@/components/ui/area-sparkline";
import { TYPE_META } from "@/features/timeline/model";
import { useTimelineStore } from "@/features/timeline/store";
import { HR_DATA } from "@/features/health/data/seed";
import { useDocumentsStore } from "@/features/documents/store";

export function RecordTabsCard() {
  const events = useTimelineStore((s) => s.events);
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  const documents = useDocumentsStore((s) => s.documents);

  return (
    <div className="card">
      <Tabs.Root defaultValue="Timeline">
        <Tabs.List className="pills" aria-label="Record sections" style={{ marginBottom: 12, marginTop: 0 }}>
          {["Timeline", "Vitals", "Documents"].map((t) => (
            <Tabs.Trigger key={t} value={t} className="pill pill-tiny">
              {t}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="Timeline">
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
        </Tabs.Content>

        <Tabs.Content value="Vitals">
          <div className="vitalhead">
            <b className="vnum">79</b>
            <span className="small">bpm latest · spike 118 on 19 Aug</span>
          </div>
          <AreaSparkline data={HR_DATA} gradientId="clinician-hr-gradient" height={90} />
        </Tabs.Content>

        <Tabs.Content value="Documents">
          {documents.map((d) => (
            <MiniRow key={d.id}>
              <RowIcon icon="doc" color="#C08A2D" bg="#C08A2D22" sm />
              <span>
                <b>{d.name}</b>
                <span className="small block">{d.date}</span>
              </span>
            </MiniRow>
          ))}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
