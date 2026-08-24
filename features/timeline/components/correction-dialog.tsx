"use client";

import { useState } from "react";
import { Btn } from "@/components/ui/button";
import { OverlayShell } from "@/components/ui/overlay-shell";
import { selectEventById, useTimelineStore } from "../store";

export function CorrectionDialog() {
  const correctionId = useTimelineStore((s) => s.correctionId);
  const closeCorrection = useTimelineStore((s) => s.closeCorrection);
  const correct = useTimelineStore((s) => s.correct);
  const ev = useTimelineStore(selectEventById(correctionId));

  const [txt, setTxt] = useState("");

  // Fresh input each time the dialog opens (render-time state adjustment).
  const [prevId, setPrevId] = useState(correctionId);
  if (prevId !== correctionId) {
    setPrevId(correctionId);
    setTxt("");
  }

  const submit = () => {
    const note = txt.trim();
    if (!note || !correctionId) return;
    correct(correctionId, note);
    setTxt("");
  };

  return (
    <OverlayShell
      variant="center"
      width={460}
      open={!!correctionId}
      onClose={closeCorrection}
      title="This is incorrect"
    >
      <b className="ptitle-sm">This is incorrect</b>
      <p className="small" style={{ margin: "8px 0 12px" }}>
        About: <b>{ev?.title}</b>. The original record is preserved — your
        correction becomes a new provenance-bearing state.
      </p>
      <textarea
        className="tarea"
        autoFocus
        placeholder="What’s wrong?"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        aria-label="Describe what is wrong"
      />
      <div className="actrow" style={{ justifyContent: "flex-end" }}>
        <Btn kind="soft" sm onClick={closeCorrection}>
          Cancel
        </Btn>
        <Btn kind="dark" sm icon="check" onClick={submit}>
          Submit correction
        </Btn>
      </div>
    </OverlayShell>
  );
}
