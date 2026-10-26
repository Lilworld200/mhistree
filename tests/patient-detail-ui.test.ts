// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PatientDetailView } from "@/features/practitioner/patient-detail-view";
import { MobileTopbarTarget } from "@/components/layout/mobile-topbar-actions";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
vi.mock("@/features/practitioner/workspace-view", () => ({
  WorkspaceView: ({ section }: { section: string }) =>
    createElement("p", null, `Authorized care tools: ${section}`),
}));
let root: Root, host: HTMLDivElement, mobileBar: HTMLDivElement;
const overview = {
  summaryKind: "today",
  asOf: "2026-10-25T08:00:00Z",
  timezone: "Africa/Lagos",
  summary: [
    {
      id: "event-one",
      text: "The patient reported a headache after jogging.",
      category: "symptom",
      sourceStatus: "patient-reported",
      status: "active",
      recordedAt: "2026-10-25T08:00:00Z",
    },
  ],
  medications: [],
  prescriptions: [],
  results: [],
  limited: false,
};
const workspace = {
  patient: {
    display_name: "Alex Synthetic",
    birth_date: "1995-03-12",
    mhistree_id: "MH-SYNTHETIC",
  },
  revision: 1,
  permissions: { read: ["symptom"], write: ["symptom"] },
  overview,
  state: [],
  recent: [],
  work: [],
  requests: [],
  messages: null,
};
async function mount(detail = workspace) {
  request.mockImplementation(async (_path, input) =>
    _path.includes("view=timeline")
      ? { items: [], nextCursor: null }
      : input?.action === "ai"
        ? {
            text: "This is a reviewed-evidence suggestion.",
            limitations: ["Limited shared history"],
            evidenceIds: ["event-one"],
          }
        : detail,
  );
  host = document.createElement("div");
  document.body.append(host);
  mobileBar = document.createElement("div");
  document.body.append(mobileBar);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        MobileTopbarTarget.Provider,
        { value: mobileBar },
        createElement(PatientDetailView, { connectionId: "connection-one" }),
      ),
    ),
  );
}
function button(text: string) {
  const value = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find(
    (b) =>
      b.textContent?.includes(text) || b.getAttribute("aria-label") === text,
  );
  if (!value) throw Error(`Missing ${text}`);
  return value;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  mobileBar?.remove();
  request.mockReset();
});
it("places the mobile back link in the app bar and retains the desktop back link", async () => {
  await mount();
  expect(mobileBar.querySelector("a")?.textContent).toContain(
    "Back to My patients",
  );
  expect(mobileBar.querySelector("a")?.getAttribute("href")).toBe(
    "/clinician/patients",
  );
  expect(host.querySelector(".patient-detail-back")?.getAttribute("href")).toBe(
    "/clinician/patients",
  );
});
it("shows patient identity, a back link and permission-aware section cards rather than the old workspace dump", async () => {
  await mount();
  expect(host.textContent).toContain("Alex Synthetic");
  expect(host.querySelector("a")?.getAttribute("href")).toBe(
    "/clinician/patients",
  );
  expect(host.textContent).toContain("Today's reports");
  expect(host.textContent).not.toContain("Patient workspace");
  expect(host.textContent).not.toContain("Medications & prescriptions");
  expect(host.textContent).not.toContain("Care inbox");
  expect(
    host.querySelector('.patient-folder-tab [aria-label="Requests & results"]'),
  ).toBeNull();
  expect(
    host.querySelector(".patient-identity-card")?.textContent,
  ).not.toContain("Connected");
});
it("opens scoped summaries without an automatic AI call and keeps care tools in their own panel", async () => {
  await mount();
  await act(async () => button("Health summary").click());
  expect(request.mock.calls.some((call) => call[1]?.action === "ai")).toBe(
    false,
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "headache after jogging",
  );
  await act(async () => button("Close panel").click());
  await act(async () => button("Care notes").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Authorized care tools: work",
  );
});
it("provides patient-scoped AI conversation and retains a failed question for retry", async () => {
  await mount();
  await act(async () => button("Ask Mhistree").click());
  const input = document.querySelector<HTMLTextAreaElement>(
    "#patient-ai-question",
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "What reports relate to jogging?");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  request.mockRejectedValueOnce(new Error("PROVIDER_UNAVAILABLE"));
  await act(async () =>
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(input.value).toBe("What reports relate to jogging?");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "kept",
  );
  await act(async () =>
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith("/api/practitioner/workspace", {
    connectionId: "connection-one",
    action: "ai",
    data: {
      question: "What reports relate to jogging?",
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
      timezone: expect.any(String),
    },
  });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "reviewed-evidence suggestion",
  );
  expect(input.value).toBe("");
});
it("access loss clears patient details and any open AI panel", async () => {
  await mount();
  await act(async () => button("Ask Mhistree").click());
  request.mockRejectedValueOnce(new Error("ACCESS_DENIED"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(host.textContent).not.toContain("Alex Synthetic");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain("ACCESS_DENIED");
});
it("an access revision change closes an open panel before presenting refreshed scope", async () => {
  await mount();
  await act(async () => button("Ask Mhistree").click());
  request.mockResolvedValueOnce({ ...workspace, revision: 2 });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("merges identity and overview with folder tools and labelled care notes", async () => {
  await mount({
    ...workspace,
    permissions: { read: ["symptom", "result"], write: ["symptom"] },
  });
  const profile = host.querySelector(".patient-profile-card")!;
  expect(profile.querySelector(".patient-identity-card")).not.toBeNull();
  expect(profile.querySelector(".patient-detail-overview")).not.toBeNull();
  expect(profile.querySelectorAll(".card")).toHaveLength(0);
  expect(host.querySelector(".patient-folder-tab")?.textContent).toContain(
    "Health summary",
  );
  expect(
    profile.querySelector('[aria-label="Care notes"]')?.textContent,
  ).toContain("Care notes");
  expect(host.querySelector(".patient-folder-tab")?.textContent).toContain(
    "Requests & results",
  );
  expect(
    host.querySelector(
      '.patient-section-grid [aria-label="Requests & results"]',
    ),
  ).toBeNull();
  await act(async () => button("Requests & results").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Authorized care tools: requests",
  );
  await act(async () => button("Close panel").click());
  expect(
    host.querySelector(".patient-detail-actions")?.textContent,
  ).not.toContain("Care notes");
  expect(
    host.querySelector(".patient-section-grid")?.textContent,
  ).not.toContain("Shared history");
  expect(
    host.querySelector(".patient-section-grid")?.textContent,
  ).not.toContain("Health summary");
  expect(
    host.querySelector(".patient-section-grid")?.textContent,
  ).not.toContain("Care notes");
  expect(host.querySelector(".patient-detail-refresh")).not.toBeNull();
});

it("combines authorized medications and browsable history within Health summary", async () => {
  await mount();
  request.mockResolvedValueOnce({
    ...workspace,
    permissions: {
      read: ["symptom", "medication-use", "prescription"],
      write: ["symptom"],
    },
  });
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(
    host.querySelector('[aria-label="Medications & prescriptions"]'),
  ).toBeNull();
  expect(
    host.querySelector(".patient-section-grid")?.textContent,
  ).not.toContain("Shared history");
  await act(async () => button("Health summary").click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Reported medication use");
  expect(dialog.textContent).toContain("Professional prescriptions");
  expect(
    dialog.querySelector(".patient-summary-history select"),
  ).not.toBeNull();
  expect(request.mock.calls.some((call) => call[1]?.action === "ai")).toBe(
    false,
  );
});
