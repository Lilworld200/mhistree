"use client";

import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { useAiAssistantStore } from "@/features/ai-assistant/store";
import { useShellStore } from "@/features/shell/store";
import { useTimelineStore } from "@/features/timeline/store";

/** Mobile-only sticky action bar (actions, not navigation). */
export function MobileClinicalToolbar() {
  const openAssistant = useAiAssistantStore((s) => s.open);
  const setCmdOpen = useShellStore((s) => s.setCmdOpen);

  const focusNote = () => {
    const el = document.getElementById("encNote");
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="ctoolbar">
      <button onClick={() => openAssistant("patient")}>
        <Icon n="spark" s={18} />
        AI
      </button>
      <button
        onClick={() => {
          const u = useTimelineStore
            .getState()
            .events.find((e) => e.status === "reported" || e.status === "inferred");
          if (u) useTimelineStore.getState().openEvidence(u.id);
          else toast("Queue clear — all verified", "check");
        }}
      >
        <Icon n="check" s={18} />
        Verify
      </button>
      <button onClick={focusNote}>
        <Icon n="edit" s={18} />
        Note
      </button>
      <button onClick={() => setCmdOpen(true)}>
        <Icon n="gear" s={18} />
        More
      </button>
    </div>
  );
}
