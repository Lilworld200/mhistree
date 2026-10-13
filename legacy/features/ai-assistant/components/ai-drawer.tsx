"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { OverlayHead, OverlayShell } from "@/components/ui/overlay-shell";
import type { AssistantContext } from "../store";
import { useAiAssistantStore } from "../store";

const PROMPTS: Record<AssistantContext, string[]> = {
  patient: [
    "Summarize the last 30 days",
    "What changed?",
    "What remains unverified?",
    "What information is missing?",
  ],
  document: ["What does this document change?", "Extract the key values"],
  conversation: ["What memory did you use?", "Show sources for this reply"],
  health: ["What changed recently?", "Any red flags?", "Summarise my week"],
};

/* DEMO ADAPTER — canned evidence-linked answers.
   Production path: POST /api/ai/chat scoped by context + active lease,
   answered through the LLM Gateway (see lib/ai/gateway.ts). */
const ANSWERS: Record<string, string> = {
  "What changed recently?":
    "Two new symptom reports (17–19 Aug), one device HR spike, and a verified medication start. Overall trend: improving.",
  "Any red flags?":
    "Nothing emergency-grade. The resting HR spike is worth verifying — it followed the breathing episode.",
  "Summarise my week":
    "Busy week: practicals, exams, one breathing episode that resolved, inhaler started. Sleep slightly short.",
  "What memory did you use?":
    "I retrieved your respiratory episode (17–21 Aug) and inhaler start — nothing else left your private context.",
  "Show sources for this reply":
    "Sources: e1 breathing difficulty, e4 inhaler start. Both carry provenance.",
  "What does this document change?":
    "It adds lab-verified evidence (FBC normal) that constrains differential hypotheses.",
  "Extract the key values":
    "Extracted: Hb 13.8 g/dL, WBC within range. Linked to your timeline as a lab-verified event.",
  "Summarize the last 30 days":
    "Aug: 8 events — 2 symptom reports, 1 device HR spike, inhaler started (verified), FBC normal (lab), GP visit 07 Aug.",
  "What changed?":
    "Inhaler started 20 Aug (verified). Symptom cluster 17–19 Aug. No new labs since 15 Aug.",
  "What remains unverified?":
    "Symptom reports (e1, e2, e3) and the AI hypothesis (e7) await clinician verification.",
  "What information is missing?":
    "Spirometry (28 Aug), severity scores, trigger confirmation, adherence.",
};

interface FeedItem {
  q: string;
  a: string;
}

export function AiDrawer() {
  const context = useAiAssistantStore((s) => s.context);
  const close = useAiAssistantStore((s) => s.close);
  const [feed, setFeed] = useState<FeedItem[]>([]);

  const ctx: AssistantContext = context ?? "health";

  // Reset the conversation whenever the drawer reopens in a new context
  // (render-time state adjustment — no effect cascade).
  const [prevCtx, setPrevCtx] = useState<AssistantContext>(ctx);
  if (prevCtx !== ctx) {
    setPrevCtx(ctx);
    setFeed([]);
  }

  const ask = (q: string) =>
    setFeed((f) => [...f, { q, a: ANSWERS[q] ?? "I can only reason over the authorised evidence in this context." }]);

  return (
    <OverlayShell
      open={!!context}
      onClose={close}
      title="Ask Mhistree"
      width={520}
    >
      <OverlayHead
        title={
          <span className="hpill hpill-dark">
            <Icon n="spark" s={13} />
            Ask Mhistree
          </span>
        }
        onClose={close}
      />
      <div className="scroll" style={{ padding: "0 22px 22px" }}>
        <p className="small">
          Context: <b>{ctx}</b> · answers stay evidence-linked.
        </p>
        <div className="qchips">
          {PROMPTS[ctx].map((p) => (
            <button key={p} className="pill pill-tiny on" onClick={() => ask(p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="feed">
          {feed.map((f, i) => (
            <motion.div
              key={i}
              className="feeditem"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <b className="small">{f.q}</b>
              <p className="small">{f.a}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </OverlayShell>
  );
}
