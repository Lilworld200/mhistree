import { describe, expect, it } from "vitest";
import {
  boundedHistory,
  contextPlan,
  recallDay,
} from "@/features/ai-chat/context-plan";
import { replyText } from "@/features/ai-chat/reply-text";
import { patientChatPolicy } from "@/features/ai-chat/patient-prompt";

describe("bounded patient chat context and presentation", () => {
  it("routes continuity, dates and health to timeline without a model call", () => {
    for (const text of [
      "I'm still feeling stressed",
      "My belly hurts",
      "What happened on October 17?",
      "What medication did I take before?",
    ])
      expect(contextPlan(text).timeline).toBe(true);
    expect(contextPlan("Hello, how are you?").timeline).toBe(false);
    expect(contextPlan("Help me write a poem").timeline).toBe(false);
    expect(contextPlan("I'm still feeling stressed").summaries).toBe(false);
    expect(contextPlan("Remember my coding project?").summaries).toBe(true);
    for (const command of ["Read my timeline", "Check my timeline"]) {
      expect(contextPlan(command).timeline).toBe(true);
      expect(contextPlan(command).broad).toBe(true);
    }
  });
  it("bounds active messages and retains the latest full patient turn", () => {
    const all = Array.from({ length: 20 }, (_, i) => ({
      content: `${i}:` + "x".repeat(1900),
    }));
    const bounded = boundedHistory(all);
    expect(bounded).toHaveLength(5);
    expect(bounded.at(-1)).toBe(all.at(-1));
    expect(
      bounded.reduce((n, m) => n + m.content.length, 0),
    ).toBeLessThanOrEqual(10000);
    expect(
      boundedHistory([{ content: "old" }, { content: "x".repeat(10000) }]),
    ).toHaveLength(1);
    expect(patientChatPolicy.length).toBeLessThan(4500);
  });
  it("uses the patient's local calendar for relative dates", () => {
    const now = new Date("2026-10-26T23:30:00Z");
    expect(recallDay("yesterday", "Africa/Lagos", now)).toBe("2026-10-26");
    expect(recallDay("on October 17", "Africa/Lagos", now)).toBe("2026-10-17");
    expect(recallDay("on 17 October", "Africa/Lagos", now)).toBe("2026-10-17");
    expect(recallDay("last Monday", "Africa/Lagos", now)).toBe("2026-10-26");
    expect(recallDay("2026-10-20", "Africa/Lagos", now)).toBe("2026-10-20");
    expect(recallDay("sometime earlier", "Africa/Lagos", now)).toBeNull();
  });
  it("strips the screenshot echo, pretty JSON, fences and repeated echoes", () => {
    const capture =
      'Source capture: {"capturedAt":"2026-10-27T15:39:41.112Z","timezone":"Africa/Lagos","local":"Tuesday","elapsedSeconds":-14}';
    expect(replyText(`${capture}\nTwo cups—got it.`)).toBe("Two cups—got it.");
    expect(
      replyText(
        `**Source capture**: {\n"local":"brace } inside",\n"capturedAt":"2026"\n}\nHello`,
      ),
    ).toBe("Hello");
    expect(replyText(`${capture}\n${capture}\nHello`)).toBe("Hello");
    expect(replyText('```json\n{"capturedAt":"2026"}\n```\nHello')).toBe(
      "Hello",
    );
    expect(replyText('Source capture: {"capturedAt":"unfinished')).toBe("");
    expect(replyText('Hello\n"sourceDates": [{"at":"2026"}]')).toBe("");
    expect(
      replyText("You mentioned stress on October 17. How are you feeling?"),
    ).toContain("October 17");
  });
});
