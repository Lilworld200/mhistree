"use client";

import { Icon, Logo } from "@/components/ui/icons";
import { Typewriter } from "@/components/ui/typewriter";
import { motion } from "motion/react";
import { toast } from "@/components/ui/toast-store";
import { useAiAssistantStore } from "@/features/ai-assistant/store";
import { useTimelineStore } from "@/features/timeline/store";
import type { ChatMessage } from "../types";

export function MessageBubble({ m, last }: { m: ChatMessage; last: boolean }) {
  if (m.role === "sys") return <SysChip m={m} />;
  if (m.role === "user") return <UserBubble m={m} />;
  return <AiBubble m={m} last={last} />;
}

function SysChip({ m }: { m: ChatMessage }) {
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  return (
    <motion.div
      className="sysrow"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <button
        className="syschip"
        onClick={() => m.evId && openEvidence(m.evId)}
      >
        <Icon n="plus" s={13} c="#2F8F5B" />
        {m.text}
        <Icon n="chev" s={13} />
      </button>
    </motion.div>
  );
}

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <motion.div
      className="brow brow-user"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="bubble bubble-user">{m.text}</div>
    </motion.div>
  );
}

function AiBubble({ m, last }: { m: ChatMessage; last: boolean }) {
  const openAssistant = useAiAssistantStore((s) => s.open);

  const copy = () => {
    void navigator.clipboard?.writeText(m.text).then(
      () => toast("Copied to clipboard", "check"),
      () => toast("Copy is unavailable here", "x"),
    );
  };

  return (
    <motion.div
      className="brow brow-ai"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="aav">
        <Logo s={22} />
      </span>
      <div className="bubble">
        {m.mem && (
          <span className="memchip">
            <Icon n="spark" s={12} />
            Using your health history
          </span>
        )}
        <Typewriter text={m.text} on={!!m.fresh && last} />
        <div className="macts">
          <button onClick={copy}>Copy</button>
          <button onClick={() => toast("Reading aloud… (demo)", "mic")}>
            Listen
          </button>
          <button onClick={() => openAssistant("conversation")}>
            View evidence
          </button>
        </div>
      </div>
    </motion.div>
  );
}
