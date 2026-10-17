import { expect, it } from "vitest";
import { resolveTime } from "@/features/ai-chat/extraction/time";

it("anchors parts of day to the patient's calendar across UTC midnight without invented clock times", () => {
  const captured = new Date("2026-10-31T23:30:00Z"); // Already November in Lagos.
  expect(resolveTime("this morning", captured, "Africa/Lagos")).toEqual({
    precision: "approximate",
    from: "2026-10-31T23:00:00.000Z",
    to: "2026-11-01T23:00:00.000Z",
    originalPhrase: "this morning",
  });
  expect(resolveTime("last night", captured, "Africa/Lagos")).toEqual({
    precision: "approximate",
    from: "2026-10-30T23:00:00.000Z",
    to: "2026-11-01T23:00:00.000Z",
    originalPhrase: "last night",
  });
  expect(resolveTime("last night", captured, "unknown").precision).toBe(
    "unknown",
  );
  expect(resolveTime("one morning", captured, "Africa/Lagos").precision).toBe(
    "unknown",
  );
});
