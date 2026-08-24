"use client";

import { Label } from "@/components/ui/label";
import { useTimelineStore } from "@/features/timeline/store";

const SECTIONS: Array<[string, string, string]> = [
  ["What changed", "Exertional breathlessness clustered 17–19 Aug; inhaler started 20 Aug; symptoms improving.", "e1"],
  ["Recent episodes", "Respiratory symptoms 17–21 Aug (4 events).", "ep1"],
  ["Important background", "Penicillin allergy (verified). FBC normal. Prior allergic reaction admission 04 Aug, resolved.", "e5"],
  ["Open questions", "Spirometry pending 28 Aug. Trigger confirmation. Adherence unknown.", "e6"],
  ["Potential concerns", "One resting HR spike (118 bpm, device) following the breathing episode.", "e3"],
];

export function ClinicalBriefingCard() {
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  return (
    <div className="card">
      <Label
        right={
          <span className="badge" style={{ color: "var(--amber)" }}>
            <i className="badge-dot" style={{ background: "var(--amber)" }} />
            AI — not a note
          </span>
        }
      >
        AI clinical briefing
      </Label>
      {SECTIONS.map(([k, v, evId]) => (
        <div key={k} className="briefsec">
          <span className="mlabel">{k.toUpperCase()}</span>
          <p className="small">{v}</p>
          <button className="link" onClick={() => openEvidence(evId)}>
            View evidence
          </button>
        </div>
      ))}
    </div>
  );
}
