import type { ReplyRule } from "../types";

/* ────────────────────────────────────────────────────────────────
   DEMO ADAPTER — keyword simulation of Mhistree's extraction +
   conversational reasoning. Replace with POST /api/ai/chat which
   routes through the LLM Gateway (lib/ai/gateway.ts). The UI must
   not need to change when that happens: this module is the seam.
   ──────────────────────────────────────────────────────────────── */

export const REPLY_RULES: ReplyRule[] = [
  {
    re: /breath|wheeze|chest/i,
    type: "Symptom",
    title: "Breathing difficulty",
    reply: (p) =>
      p
        ? "Last time you mentioned the breathlessness happened after exercise — was today similar? I’ve added this episode to your timeline so the pattern stays visible."
        : "That sounds uncomfortable. I’ve noted it in your health timeline so it isn’t lost. Is it completely gone now, or are you still feeling it?",
  },
  {
    re: /headache|migraine/i,
    type: "Symptom",
    title: "Headache",
    reply: () =>
      "Sorry about that. I’ve saved it with the time you mentioned. Did it start after activity, or more out of the blue?",
  },
  {
    re: /fever|temperature|hot flashes/i,
    type: "Symptom",
    title: "Feverish feeling",
    reply: () =>
      "Got it — I’ve logged it. Have you been able to measure your temperature, or is it more of a feeling?",
  },
  {
    re: /sleep|insomnia|tired/i,
    type: "Symptom",
    title: "Fatigue / sleep note",
    reply: () =>
      "That matters more than people think. I’ve kept it as a lifestyle note, not a medical fact. Want me to watch this pattern over the next few days?",
  },
];

export const GENERIC_REPLIES = [
  "I hear you. I’ll keep that as personal context — it stays private unless you decide to share it.",
  "Thanks for sharing that with me. Nothing here needs a health entry, so it stays in our conversation only.",
  "Noted. If any of this turns into something health-related, I’ll ask before adding it to your timeline.",
];

/** Truncate for a session title without cutting mid-word. */
export function titleFromText(text: string, max = 26): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return space > 10 ? cut.slice(0, space) : cut;
}
