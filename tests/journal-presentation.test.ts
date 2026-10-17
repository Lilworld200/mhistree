// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  RecordCard,
  type DisplayRecord,
} from "@/features/health-records/timeline-view";
import { WorkspaceView } from "@/features/practitioner/workspace-view";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (e: Error) => e.message,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.resetAllMocks();
});
const record: DisplayRecord = {
  id: "synthetic-event",
  logical_id: "synthetic-report",
  version: 2,
  category: "activity",
  source_status: "patient-reported",
  source_id: "synthetic-source",
  captured_at: "2026-10-17T09:00:00Z",
  recorded_at: "2026-10-17T09:00:01Z",
  author_account_id: "synthetic-author",
  original_organization_id: null,
  body: {
    text: "went jogging for 40 minutes and found the run stressful.",
    reportStyle: "reported-predicate",
    bodySite: null,
    contextLinks: [],
  },
  occurred_at: {
    precision: "range",
    from: "2026-10-16T23:00:00Z",
    to: "2026-10-17T23:00:00Z",
  },
  status: "unknown",
  source_spans: ["That same run lasted 40 minutes."],
};
async function mount(element: ReturnType<typeof createElement>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}
it("shows a complete patient journal sentence with distinct event/submission timing and retained version controls", async () => {
  await mount(createElement(RecordCard, { record }));
  expect(host.querySelector("summary")?.textContent).toContain(
    "You reported that you went jogging for 40 minutes and found the run stressful.",
  );
  expect(host.textContent).toContain("Reported interval");
  expect(host.textContent).toContain("Submitted:");
  expect(host.textContent).toContain("Version history");
  expect(host.textContent).not.toContain("The patient reported");
});
it.each([false, true])(
  "uses the same stored description with care-team wording (organization=%s)",
  async (organization) => {
    apiMock.mockResolvedValue({
      patientPersonId: "synthetic-person",
      revision: 1,
      state: [],
      recent: [record],
      work: [],
      requests: [],
      messages: null,
    });
    await mount(
      createElement(WorkspaceView, {
        connectionId: "synthetic-connection",
        ...(organization
          ? {
              organizationContext: {
                kind: "organization" as const,
                connectionId: "synthetic-connection",
                organizationId: "synthetic-organization",
                assignmentId: "synthetic-assignment",
              },
            }
          : {}),
      }),
    );
    expect(host.textContent).toContain(
      "The patient reported that they went jogging for 40 minutes and found the run stressful.",
    );
    expect(host.textContent).not.toContain("You reported that you");
    expect(host.textContent).toContain("Reported interval");
    expect(host.textContent).toContain("Recorded:");
  },
);
it("uses attributed source wording for an old keyword entry without inventing a narrative", async () => {
  await mount(
    createElement(RecordCard, {
      record: {
        ...record,
        body: { ...record.body, text: "jogging", reportStyle: undefined },
        source_spans: ["I went jogging and found it stressful."],
      },
    }),
  );
  expect(host.querySelector("summary")?.textContent).toContain(
    "You reported: “I went jogging and found it stressful.”",
  );
});
