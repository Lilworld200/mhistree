// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TodayView } from "@/features/practitioner/today-view";
import {
  ProfessionalProfile,
  type ProfessionalProfileData,
} from "@/features/practitioner/profile-view";
import type { Today, DailyView } from "@/features/practitioner/daily-types";
const request = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (error: Error) => error.message,
}));
let host: HTMLDivElement, root: Root;
const start = new Date(Date.now() + 86400000).toISOString(),
  end = new Date(Date.now() + 90000000).toISOString();
const initial: Today = {
  items: [
    {
      connectionId: "connection",
      patientName: "Synthetic patient",
      unread: 2,
      appointments: [
        {
          id: "booking",
          version: 4,
          starts_at: start,
          ends_at: end,
          state: "requested",
        },
      ],
      requests: [
        { id: "req", service_name: "Synthetic test", state: "requested" },
        {
          id: "result",
          service_name: "Finalized test",
          state: "finalized",
          result_event_id: "event",
        },
      ],
      reminders: [
        {
          id: "reminder",
          body: { text: "Private reminder text" },
          due_at: null,
        },
      ],
    },
  ],
  availability: [
    { id: "slot", version: 2, starts_at: start, ends_at: end, timezone: "UTC" },
  ],
  notifications: [],
  limited: false,
};
async function render(element: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}
async function daily(view: DailyView = "dashboard", manage = true) {
  request.mockResolvedValue(initial);
  await render(
    createElement(TodayView, { initial, view, canManageAppointments: manage }),
  );
}
function button(label: string) {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((el) => el.textContent?.trim() === label);
  if (!found) throw Error(`Missing ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function submit() {
  await act(async () =>
    document
      .querySelector<HTMLFormElement>('[role="dialog"] form')!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  request.mockReset();
});
it("dashboard exposes required care sections and scoped patient links without inventing activity", async () => {
  await daily();
  expect(host.textContent).toContain("Private reminder text");
  expect(host.textContent).toContain("Finalized results");
  expect(
    host.querySelector(
      'a[href="/clinician/patients/connection#care-text-inbox"]',
    ),
  ).not.toBeNull();
  expect(host.querySelector('a[href="/clinician/schedule"]')).not.toBeNull();
  expect(host.textContent).toContain("No recent activity");
});
it("a failed current-access refresh clears displayed sensitive work", async () => {
  await daily();
  request.mockRejectedValueOnce(new Error("SESSION_RETIRED"));
  await click("Refresh");
  expect(host.textContent).not.toContain("Private reminder text");
  expect(host.textContent).not.toContain("Synthetic patient");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("schedule accepts without sending irrelevant replacement dates", async () => {
  await daily("schedule");
  await click("Manage appointment");
  expect(document.querySelector('input[name="start"]')).toBeNull();
  await submit();
  expect(request).toHaveBeenCalledWith("/api/practitioner/workspace", {
    connectionId: "connection",
    action: "appointment",
    data: { id: "booking", version: 4, action: "accept" },
  });
});
it("denied appointment mutation closes the panel and clears care data", async () => {
  await daily("schedule");
  await click("Manage appointment");
  request.mockRejectedValueOnce(new Error("ACCESS_REVOKED"));
  await submit();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).not.toContain("Synthetic patient");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("reschedule requires replacement dates and keeps them out of other actions", async () => {
  await daily("schedule");
  await click("Manage appointment");
  const select = document.querySelector<HTMLSelectElement>(
    '[role="dialog"] select',
  )!;
  await act(async () => {
    select.value = "reschedule";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(
    document.querySelector<HTMLInputElement>('input[name="start"]')?.required,
  ).toBe(true);
  await act(async () => {
    select.value = "cancel";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(document.querySelector('input[name="start"]')).toBeNull();
  expect(
    document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[type="checkbox"]',
    )?.required,
  ).toBe(true);
});
it("availability removal requires confirmation and preserves version checks", async () => {
  await daily("schedule");
  await click("Remove slot");
  expect(request).not.toHaveBeenCalled();
  await click("Confirm removal");
  expect(request).toHaveBeenCalledWith("/api/practitioner/today", {
    action: "remove",
    data: { id: "slot", version: 2 },
  });
});
it("read-only professional capabilities do not expose appointment mutations", async () => {
  await daily("schedule", false);
  expect(host.textContent).not.toContain("Add availability");
  expect(host.textContent).not.toContain("Manage appointment");
  expect(host.textContent).not.toContain("Remove slot");
});
it("inbox and requests retain the patient care context; results have a distinct filter", async () => {
  await daily("inbox");
  expect(
    host.querySelector(
      'a[href="/clinician/patients/connection#care-text-inbox"]',
    ),
  ).not.toBeNull();
  await act(async () =>
    root.render(
      createElement(TodayView, { initial, view: "requests", key: "requests" }),
    ),
  );
  expect(host.textContent).toContain("Synthetic test");
  expect(host.textContent).not.toContain("Finalized test");
  await click("Finalized results");
  expect(host.textContent).toContain("Finalized test");
  expect(host.textContent).not.toContain("Synthetic test");
});
const profile: ProfessionalProfileData = {
  profile: {
    status: "approved",
    version: 3,
    privileges: ["records.read", "results.finalize"],
  },
  applications: [
    {
      id: "application",
      legal_name: "Dr. Synthetic",
      profession: "Medical doctor",
      registration_number: "DEMO-ONLY",
      jurisdiction: "Demonstration only",
      credential_name: "synthetic.pdf",
      submitted_at: "2026-10-22T10:00:00Z",
    },
  ],
};
it("professional profile shows truthful credentials/capabilities without self-approval or a duplicate application form", async () => {
  await render(createElement(ProfessionalProfile, { initial: profile }));
  expect(host.textContent).toContain("DEMO-ONLY");
  expect(host.textContent).toContain("Finalize results");
  expect(host.querySelector("form")).toBeNull();
  expect(
    host.querySelector('a[href="/profile?workspace=practitioner"]'),
  ).not.toBeNull();
});
it("pending applications return to the existing reviewed application flow", async () => {
  await render(
    createElement(ProfessionalProfile, {
      initial: {
        ...profile,
        profile: { status: "pending", version: 1, privileges: [] },
      },
    }),
  );
  expect(host.textContent).toContain("Under review");
  expect(
    host.querySelector('a[href="/auth/professional/practitioner"]'),
  ).not.toBeNull();
  expect(host.textContent).not.toContain("Finalize results");
});
