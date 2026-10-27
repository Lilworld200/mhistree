"use client";

import { IconBtn } from "@/components/ui/button";

export function RecordingControls({
  state,
  level,
  onCancel,
  onStop,
}: {
  state: "starting" | "recording" | "transcribing";
  level: number;
  onCancel: () => void;
  onStop: () => void;
}) {
  const volume = state === "recording" ? Math.max(0, Math.min(1, level)) : 0;
  return (
    <div className="voice-recording-panel">
      <IconBtn
        icon="x"
        size={28}
        title="Cancel recording"
        className="voice-recording-cancel"
        onClick={onCancel}
      />
      <div className="voice-recording-visual" aria-hidden="true">
        {[0.65, 1, 0.8].map((weight, index) => (
          <span key={index} style={{ height: 6 + volume * weight * 26 }} />
        ))}
      </div>
      {state === "recording" && (
        <IconBtn
          icon="stop"
          size={36}
          title="Stop recording"
          className="voice-recording-stop"
          onClick={onStop}
        />
      )}
      <p className="sr-only" role="status">
        {state === "starting"
          ? "Opening microphone…"
          : state === "recording"
            ? "Listening… stops after 5 seconds of silence (60 seconds maximum)."
            : "Converting speech to text…"}
      </p>
    </div>
  );
}
