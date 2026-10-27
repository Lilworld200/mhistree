import { describe, it, expect } from "vitest";
import { timeAnchor, continuityPolicy } from "@/features/ai-chat/temporal";
import { conversationPreview } from "@/features/ai-chat/conversation";
describe("source clocks and conversation previews", () => {
  it("retains four-minute and morning-to-night elapsed gaps", () => {
    const at = "2026-10-26T08:00:00Z";
    expect(
      timeAnchor(at, "Africa/Lagos", new Date("2026-10-26T08:04:00Z"))
        .elapsedSeconds,
    ).toBe(240);
    const night = timeAnchor(
      at,
      "Africa/Lagos",
      new Date("2026-10-26T20:00:00Z"),
    );
    expect(night.elapsedSeconds).toBe(43200);
    expect(night.local).toContain("09:00:00");
  });
  it("keeps source-zone date across midnight, travel and DST", () => {
    const now = new Date("2026-11-01T06:30:00Z");
    const early = timeAnchor("2026-11-01T05:30:00Z", "America/New_York", now);
    const late = timeAnchor(now, "America/New_York", now);
    expect(early.elapsedSeconds).toBe(3600);
    expect(early.local).toContain("01:30:00");
    expect(late.local).toContain("01:30:00");
    expect(early.local).not.toEqual(late.local);
    expect(timeAnchor("2026-10-26T23:30:00Z", "Africa/Lagos").local).toContain(
      "27 October",
    );
    expect(
      timeAnchor("2026-10-26T23:30:00Z", "America/New_York").local,
    ).toContain("26 October");
  });
  it("keeps unknown zones unknown and forbids equating upload time and event time", () => {
    expect(timeAnchor("2020-01-01T00:00:00Z", "unknown").local).toBeNull();
    expect(continuityPolicy).toContain("approximate/range/unknown");
    expect(continuityPolicy).toContain(
      "Old uploads do not prove current symptoms",
    );
  });
  it("uses short opening previews and suppresses obvious identifiers", () => {
    expect(conversationPreview("  Coding all day\n and feeling tired  ")).toBe(
      "Coding all day and feeling tired",
    );
    expect(
      conversationPreview(
        "Email me test@example.com https://example.com 1234567",
      ),
    ).toBe("Email me");
    expect(conversationPreview("")).toBe("New conversation");
    expect(conversationPreview("a".repeat(100))).toHaveLength(64);
  });
});
