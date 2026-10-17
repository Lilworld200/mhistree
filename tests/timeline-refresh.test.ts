// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  TimelineView,
  type DisplayRecord,
} from "@/features/health-records/timeline-view";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (e: Error) => e.message,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
const record = (id: string, text: string): DisplayRecord => ({
  id,
  logical_id: id,
  version: 1,
  category: "symptom",
  source_status: "patient-reported",
  source_id: id,
  captured_at: "2026-10-17T08:00:00Z",
  recorded_at: "2026-10-17T08:00:01Z",
  author_account_id: "synthetic",
  original_organization_id: null,
  body: {
    text,
    reportStyle: "reported-predicate",
    bodySite: "belly",
    contextLinks: [],
  },
  occurred_at: {
    precision: "approximate",
    from: "2026-10-16T23:00:00Z",
    to: "2026-10-17T23:00:00Z",
    originalPhrase: "this morning",
  },
  status: "unknown",
  source_spans: [text],
});
const fresh = record(
  "fresh",
  "noticed a swollen belly after eating the previous night.",
);
async function mount() {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(TimelineView)));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
  apiMock.mockReset();
  vi.useRealTimers();
});
it("refreshes a still-mounted timeline when returning to its tab", async () => {
  apiMock
    .mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValue({ items: [fresh], nextCursor: null });
  await mount();
  expect(host.textContent).not.toContain("swollen belly");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).toContain("swollen belly");
});
it("refreshes after record processing finishes without a route change", async () => {
  apiMock
    .mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValue({ items: [fresh], nextCursor: null });
  await mount();
  await act(async () =>
    window.dispatchEvent(new Event("mhistree:records-changed")),
  );
  expect(host.textContent).toContain("swollen belly");
});
it("checks for new records while visible without needing a full reload", async () => {
  vi.useFakeTimers();
  apiMock
    .mockResolvedValueOnce({ items: [], nextCursor: null })
    .mockResolvedValue({ items: [fresh], nextCursor: null });
  await mount();
  await act(async () => vi.advanceTimersByTimeAsync(15000));
  expect(host.textContent).toContain("swollen belly");
});
it("preserves older pages until an explicit refresh replaces the snapshot", async () => {
  const older = record("older", "noticed earlier discomfort");
  apiMock
    .mockResolvedValueOnce({ items: [fresh], nextCursor: "old-cursor" })
    .mockResolvedValueOnce({ items: [older], nextCursor: null })
    .mockResolvedValue({
      items: [record("new", "noticed a new symptom")],
      nextCursor: "new-cursor",
    });
  await mount();
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === "More events")!
      .click(),
  );
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).toContain("earlier discomfort");
  expect(host.textContent).toContain("New or updated records available");
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Refresh timeline"))!
      .click(),
  );
  expect(host.textContent).not.toContain("earlier discomfort");
  expect(host.textContent).toContain("noticed a new symptom");
});
it("clears displayed history when a refresh loses authorization", async () => {
  apiMock
    .mockResolvedValueOnce({ items: [fresh], nextCursor: "cursor" })
    .mockRejectedValue(new Error("Access denied"));
  await mount();
  expect(host.textContent).toContain("swollen belly");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).not.toContain("swollen belly");
  expect(host.textContent).toContain("Access denied");
  expect(host.textContent).not.toContain("More events");
});
