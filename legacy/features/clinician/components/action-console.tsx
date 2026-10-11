"use client";

import { useState } from "react";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { supportBand } from "@/features/timeline/model";
import { useTimelineStore } from "@/features/timeline/store";
import { useClinicianStore } from "../store";

const PROMPTS = [
  "Summarize the last 30 days",
  "What changed?",
  "What remains unverified?",
  "What information is missing?",
];

export function ActionConsole() {
  const events = useTimelineStore((s) => s.events);
  const notes = useClinicianStore((s) => s.notes);
  const consultFeed = useClinicianStore((s) => s.consultFeed);
  const openCorrection = useTimelineStore((s) => s.openCorrection);
  const verify = useTimelineStore((s) => s.verify);
  const reject = useTimelineStore((s) => s.reject);

  const [note, setNote] = useState("");
  const [ask, setAsk] = useState("");

  const hypo = events.find((e) => e.id === "e7");
  const unverified = events.filter(
    (e) => (e.status === "reported" || e.status === "inferred") && e.id !== "e7",
  );

  return (
    <div className="card">
      <Label>Clinical action console</Label>

      {hypo && (
        <div className="card card-inset" style={{ marginBottom: 12, padding: 14 }}>
          <span className="mlabel">HYPOTHESIS · AI INFERRED</span>
          <b>{hypo.title}</b>
          <SupportMeter support={hypo.support ?? 0} />
          <EvidenceChips ids={["e1", "e2", "e3"]} />
          <div className="actrow" style={{ marginTop: 10 }}>
            <Btn kind="dark" sm icon="check" onClick={() => verify(hypo.id)}>
              Verify
            </Btn>
            <Btn kind="soft" sm icon="x" onClick={() => reject(hypo.id)}>
              Reject
            </Btn>
          </div>
        </div>
      )}

      <span className="mlabel">VERIFICATION QUEUE</span>
      {unverified.map((ev) => (
        <div key={ev.id} className="vrow">
          <span className="small ell">
            <b>{ev.title}</b> · {ev.when}
          </span>
          <span className="actrow" style={{ margin: 0 }}>
            <Btn kind="soft" sm icon="check" onClick={() => verify(ev.id)}>
              Verify
            </Btn>
            <Btn kind="soft" sm icon="edit" onClick={() => openCorrection(ev.id)}>
              Correct
            </Btn>
            <Btn kind="soft" sm icon="x" onClick={() => reject(ev.id)}>
              Reject
            </Btn>
          </span>
        </div>
      ))}
      {unverified.length === 0 && (
        <p className="small">Queue clear — everything is verified or rejected.</p>
      )}

      <Label
        right={
          <span className="badge">Clinician-authored</span>
        }
      >
        Encounter note
      </Label>
      <textarea
        id="encNote"
        className="tarea"
        placeholder="Write your assessment…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Encounter note"
      />
      <Btn
        kind="soft"
        sm
        icon="plus"
        onClick={() => {
          useClinicianStore.getState().addNote(note);
          setNote("");
        }}
      >
        Add note
      </Btn>
      {notes.map((nt) => (
        <div key={nt.id} className="minirow">
          <Icon n="edit" s={14} c="#6E6E6E" />
          <span className="small">
            {nt.text} — <b>{nt.by}</b>, {nt.at}
          </span>
        </div>
      ))}

      <Label>Ask about this patient</Label>
      <div className="qchips">
        {PROMPTS.map((p) => (
          <button
            key={p}
            className="pill pill-tiny"
            onClick={() => useClinicianStore.getState().askPatient(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="feed">
        {consultFeed.map((f, i) => (
          <div key={i} className="feeditem">
            {f.q && <b className="small">{f.q}</b>}
            <p className="small">{f.a}</p>
          </div>
        ))}
      </div>
      <form
        className="actrow"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ask.trim()) return;
          useClinicianStore.getState().askPatient(ask);
          setAsk("");
        }}
      >
        <input
          className="cinput"
          style={{ flex: 1 }}
          placeholder="Question…"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          aria-label="Ask about this patient"
        />
        <Btn kind="dark" sm icon="up" type="submit">
          Ask
        </Btn>
      </form>
    </div>
  );
}

/* Scaffold §31: no fake precision percentages in clinical UI.
   Support renders as a Low/Moderate/High three-segment meter. */
function SupportMeter({ support }: { support: number }) {
  const band = supportBand(support);
  const lit = band === "High" ? 3 : band === "Moderate" ? 2 : 1;
  return (
    <>
      <div className="suprow">
        <div className="supbar" role="img" aria-label={`Support: ${band}`}>
          {[0, 1, 2].map((i) => (
            <i key={i} className={i < lit ? "lit" : ""} />
          ))}
        </div>
        <span className="small">Support {band}</span>
      </div>
      <p className="small">
        AI inference · demo-model-v0 · requires clinician verification before
        entering the ledger.
      </p>
    </>
  );
}

function EvidenceChips({ ids }: { ids: string[] }) {
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  const titleFor = useTimelineStore((s) => {
    const map: Record<string, string | undefined> = {};
    for (const e of s.events) map[e.id] = e.title;
    return map;
  });
  return (
    <div className="qchips">
      {ids.map((id) => (
        <button key={id} className="pill pill-tiny" onClick={() => openEvidence(id)}>
          {titleFor[id] ?? id}
        </button>
      ))}
    </div>
  );
}
