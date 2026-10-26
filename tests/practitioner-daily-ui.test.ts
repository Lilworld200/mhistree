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
import { MobileTopbarTarget } from "@/components/layout/mobile-topbar-actions";
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
it("dashboard refresh works from the mobile navbar portal", async () => {
  const navbar = document.createElement("div");
  request.mockResolvedValue(initial);
  await render(
    createElement(
      MobileTopbarTarget.Provider,
      { value: navbar },
      createElement(TodayView, { initial }),
    ),
  );
  const refresh = navbar.querySelector<HTMLButtonElement>("button")!;
  expect(refresh.textContent).toBe("Refresh");
  await act(async () => refresh.click());
  expect(request).toHaveBeenCalledWith("/api/practitioner/today");
  expect(
    host.querySelector(".daily-monitor-trace")?.getAttribute("aria-hidden"),
  ).toBe("true");
});
it("dashboard puts workspace links and refresh above the blue card and keeps reminders closed", async () => {
  await daily();
  const card = host.querySelector(".daily-connected-card")!;
  expect(card.querySelector(".hero.daily-activity")).not.toBeNull();
  expect(card.querySelector("h1")?.textContent).toBe("Today");
  expect(card.querySelector(".daily-dashboard-title")?.textContent).toContain(
    "Recent care updates and your private reminders.",
  );
  expect(card.contains(button("Refresh"))).toBe(false);
  const toolbar = host.querySelector(".daily-dashboard-toolbar")!;
  expect(toolbar.contains(button("Refresh"))).toBe(true);
  expect(toolbar.nextElementSibling).toBe(card);
  expect(host.querySelector(".sharing-desktop-header")).toBeNull();
  expect(host.textContent).not.toContain("Your workspace");
  expect(card.querySelector(".daily-activity-heading h2")).toBeNull();
  for (const route of ["schedule", "inbox", "requests"]) {
    expect(
      toolbar.querySelector('a[href="/clinician/' + route + '"]'),
    ).not.toBeNull();
  }
  const toggle = card.querySelector<HTMLButtonElement>(".daily-drawer-toggle")!;
  expect(toggle.textContent).toBe("Reminders1");
  expect(toggle.querySelectorAll("svg")).toHaveLength(1);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  const content = document.getElementById(
    toggle.getAttribute("aria-controls")!,
  )!;
  expect(content.hasAttribute("inert")).toBe(true);
  expect(content.getAttribute("aria-hidden")).toBe("true");
  expect(card.textContent).toContain("No recent activity");
  for (const removed of [
    "Upcoming appointments",
    "Unread conversations",
    "Outstanding requests",
    "Finalized results",
    "Organization care",
  ]) {
    expect(card.textContent).not.toContain(removed);
  }
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(content.hasAttribute("inert")).toBe(false);
  expect(content.textContent).toContain("Private reminder text");
  expect(content.textContent).toContain("Private");
  expect(
    content.querySelector(
      'a[href="/clinician/patients/connection#private-work"]',
    ),
  ).not.toBeNull();
});
it("activity renders all loaded items in a scroll region with stable ties and independent reminders", async () => {
  const data = structuredClone(initial);
  data.notifications = [
    {
      id: "older",
      kind: "appointment",
      created_at: "2026-10-19T10:00:00Z",
      connection_id: "connection",
    },
    {
      id: "tie-b",
      kind: "message",
      created_at: "2026-10-22T10:00:00Z",
      connection_id: "connection",
    },
    {
      id: "latest",
      kind: "request",
      created_at: "2026-10-23T10:00:00Z",
      connection_id: "connection",
    },
    {
      id: "tie-a",
      kind: "appointment",
      created_at: "2026-10-22T10:00:00Z",
      connection_id: "connection",
    },
    {
      id: "oldest",
      kind: "request",
      created_at: "2026-10-18T10:00:00Z",
      connection_id: "connection",
    },
  ];
  await render(createElement(TodayView, { initial: data }));
  const list = host.querySelector(".daily-activity-list")!;
  expect([...list.querySelectorAll("time")].map((el) => el.dateTime)).toEqual([
    "2026-10-23T10:00:00Z",
    "2026-10-22T10:00:00Z",
    "2026-10-22T10:00:00Z",
    "2026-10-19T10:00:00Z",
    "2026-10-18T10:00:00Z",
  ]);
  expect(
    [...list.querySelectorAll("h3")].slice(0, 3).map((el) => el.textContent),
  ).toEqual([
    "Service request update",
    "Appointment update",
    "Care message update",
  ]);
  expect(list.querySelector(".daily-feed")!.children).toHaveLength(5);
  expect(list.getAttribute("tabindex")).toBe("0");
  expect(list.querySelector(".daily-disclosure")).toBeNull();
  const drawer = host.querySelector<HTMLButtonElement>(".daily-drawer-toggle")!;
  expect(drawer.getAttribute("aria-expanded")).toBe("false");
  await act(async () => drawer.click());
  expect(drawer.getAttribute("aria-expanded")).toBe("true");
  await act(async () => drawer.click());
  expect(drawer.getAttribute("aria-expanded")).toBe("false");
  expect(
    list.querySelector(
      'a[href="/clinician/patients/connection#care-text-inbox"]',
    ),
  ).not.toBeNull();
  expect(
    list.querySelector(
      'a[href="/clinician/patients/connection#requests-results"]',
    ),
  ).not.toBeNull();
  expect(
    list.querySelector('a[href="/clinician/patients/connection"]'),
  ).not.toBeNull();
});
it("reminders sort by due date across connections with undated last and keep private links", async () => {
  const data = structuredClone(initial);
  data.items[0].reminders.push({
    id: "late",
    body: { text: "Later reminder" },
    due_at: "2026-10-30T10:00:00Z",
  });
  data.items.push({
    ...structuredClone(data.items[0]),
    connectionId: "other",
    patientName: "Other patient",
    reminders: [
      {
        id: "early",
        body: { text: "Earlier reminder" },
        due_at: "2026-10-24T10:00:00Z",
      },
    ],
  });
  await render(createElement(TodayView, { initial: data }));
  const drawer = host.querySelector<HTMLButtonElement>(".daily-drawer-toggle")!;
  expect(drawer.textContent).toContain("3");
  await act(async () => drawer.click());
  const rows = [...host.querySelectorAll(".daily-reminder-list li")];
  expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
    "Earlier reminder",
    "Later reminder",
    "Private reminder text",
  ]);
  expect(rows[0].querySelector("time")?.textContent).toMatch(/^Due /);
  expect(rows[2].textContent).toContain("No due date");
  expect(rows[0].querySelector("a")?.getAttribute("href")).toBe(
    "/clinician/patients/other#private-work",
  );
  expect(host.querySelector(".daily-activity")!.textContent).not.toContain(
    "Earlier reminder",
  );
});
it("empty reminder drawer has its own truthful empty state", async () => {
  const data = structuredClone(initial);
  data.items = [];
  await render(createElement(TodayView, { initial: data }));
  const drawer = host.querySelector<HTMLButtonElement>(".daily-drawer-toggle")!;
  expect(drawer.textContent).toContain("0");
  expect(host.textContent).toContain("No recent activity");
  expect(host.textContent).not.toContain("Show all activity");
  await act(async () => drawer.click());
  expect(host.querySelector(".daily-reminder-list")?.textContent).toContain(
    "No reminders",
  );
  expect(host.querySelector(".daily-reminder-list svg")).toBeNull();
});
it("a failed current-access refresh clears displayed sensitive work", async () => {
  await daily();
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".daily-drawer-toggle")!.click(),
  );
  expect(host.textContent).toContain("Private reminder text");
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
  await act(async () => {
    [...host.querySelectorAll<HTMLButtonElement>(".schedule-date-cell button")]
      .find(
        (button) => button.textContent === String(new Date(start).getDate()),
      )!
      .click();
  });
  await click("Remove slot");
  expect(request).not.toHaveBeenCalled();
  await click("Confirm removal");
  expect(request).toHaveBeenCalledWith("/api/practitioner/today", {
    action: "remove",
    data: { id: "slot", version: 2 },
  });
});
it("calendar joins adjacent bookings, fades past bookings and leaves requests unfilled", async () => {
  const now = new Date(),
    year = now.getFullYear(),
    month = now.getMonth();
  const booking = (day: number, state = "accepted") => ({
    id: `day-${day}`,
    version: 1,
    state,
    starts_at: new Date(year, month, day, 9).toISOString(),
    ends_at: new Date(year, month, day, 10).toISOString(),
  });
  const sample = {
    ...initial,
    items: [
      {
        ...initial.items[0],
        appointments: [
          booking(8),
          booking(9),
          booking(10),
          booking(12, "requested"),
        ],
      },
    ],
  };
  await render(
    createElement(TodayView, {
      initial: sample,
      view: "schedule",
      canManageAppointments: true,
    }),
  );
  expect(
    host.querySelectorAll(
      ".schedule-date-cell.is-booked, .schedule-date-cell.is-past",
    ),
  ).toHaveLength(3);
  const middle = [...host.querySelectorAll(".schedule-date-cell")].find(
    (cell) => cell.textContent === "9",
  )!;
  // Runs wrap visually at the week boundary instead of bridging into empty cells.
  const weekday = new Date(year, month, 9).getDay();
  expect(middle.classList.contains("join-before")).toBe(weekday !== 0);
  expect(middle.classList.contains("join-after")).toBe(weekday !== 6);
  const eighth = [...host.querySelectorAll(".schedule-date-cell")].find(
    (cell) => cell.textContent === "8",
  )!;
  expect(eighth.classList.contains("is-past")).toBe(
    new Date(year, month, 8, 10).getTime() <= Date.now(),
  );
  expect(
    [...host.querySelectorAll(".schedule-date-cell")]
      .find((cell) => cell.textContent === "12")!
      .classList.contains("is-booked"),
  ).toBe(false);
  expect(host.textContent).not.toContain("Your availability");
  await act(async () =>
    (eighth.querySelector("button") as HTMLButtonElement).click(),
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Synthetic patient",
  );
});
it("empty date creates a real connected-patient booking and refreshes the calendar", async () => {
  await daily("schedule");
  const date = new Date(start);
  await act(async () =>
    [...host.querySelectorAll<HTMLButtonElement>(".schedule-date-cell button")]
      .find((button) => button.textContent === String(date.getDate()))!
      .click(),
  );
  const select = document.querySelector<HTMLSelectElement>(
    'select[name="patient"]',
  )!;
  select.value = "connection";
  document.querySelector<HTMLInputElement>('input[name="start"]')!.value =
    `${start.slice(0, 10)}T14:00`;
  document.querySelector<HTMLInputElement>('input[name="end"]')!.value =
    `${start.slice(0, 10)}T14:30`;
  await submit();
  expect(request).toHaveBeenCalledWith(
    "/api/practitioner/workspace",
    expect.objectContaining({
      connectionId: "connection",
      action: "appointment-create",
      data: expect.objectContaining({
        connectionId: "connection",
        requestKey: expect.any(String),
        slot: expect.objectContaining({
          startsAt: expect.any(String),
          endsAt: expect.any(String),
          timezone: expect.any(String),
        }),
      }),
    }),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(
    request.mock.calls.some(([url]) => String(url).includes("?from=")),
  ).toBe(true);
});
it("approval maps the confirmed date and history replaces the availability header action", async () => {
  await daily("schedule");
  const accepted = structuredClone(initial);
  accepted.items[0].appointments[0].state = "accepted";
  request.mockResolvedValueOnce({}).mockResolvedValueOnce(accepted);
  await click("Manage appointment");
  await submit();
  expect(host.querySelector(".schedule-date-cell.is-booked")).not.toBeNull();
  expect(host.textContent).not.toContain("Add availability");
  await click("History");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Appointment history",
  );
});
it("upcoming schedule selects the nearest confirmed booking independently of the calendar month", async () => {
  const sample = structuredClone(initial);
  sample.items[0].appointments = [
    {
      ...sample.items[0].appointments[0],
      id: "past",
      state: "accepted",
      starts_at: new Date(Date.now() - 86400000).toISOString(),
      ends_at: new Date(Date.now() - 82800000).toISOString(),
    },
  ];
  sample.items[0].upcomingAppointment = {
    id: "future",
    state: "accepted",
    version: 2,
    starts_at: new Date(Date.now() + 40 * 86400000).toISOString(),
    ends_at: new Date(Date.now() + 40 * 86400000 + 1800000).toISOString(),
    timezone: "UTC",
  };
  sample.items.push({
    ...sample.items[0],
    connectionId: "later-connection",
    patientName: "Later patient",
    upcomingAppointment: {
      ...sample.items[0].upcomingAppointment,
      id: "later",
      starts_at: new Date(Date.now() + 50 * 86400000).toISOString(),
      ends_at: new Date(Date.now() + 50 * 86400000 + 1800000).toISOString(),
    },
  });
  const navbar = document.createElement("div");
  await render(
    createElement(
      MobileTopbarTarget.Provider,
      { value: navbar },
      createElement(TodayView, {
        initial: sample,
        view: "schedule",
        canManageAppointments: true,
      }),
    ),
  );
  const card = host.querySelector(".schedule-next-card")!;
  expect(card.textContent).toContain("Synthetic patient");
  expect(card.textContent).not.toContain("Later patient");
  expect(host.textContent).not.toContain("Recent history");
  const mobileButton = navbar.querySelector<HTMLButtonElement>("button")!;
  expect(mobileButton.textContent).toBe("Upcoming schedule");
  await act(async () => mobileButton.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Synthetic patient",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(
    "Later patient",
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close panel"]')!
      .click(),
  );
});
it("pending requests stay outside the upcoming preview", async () => {
  await daily("schedule");
  expect(host.querySelector(".schedule-next-card")?.textContent).toContain(
    "No upcoming schedule",
  );
  expect(host.querySelector(".schedule-requests")?.textContent).toContain(
    "Synthetic patient",
  );
});
it("month navigation reloads a bounded range and clears care on access failure", async () => {
  await daily("schedule");
  request.mockRejectedValueOnce(new Error("ACCESS_REVOKED"));
  await act(async () =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Previous month"]')!
      .click(),
  );
  const url = new URL(request.mock.calls[0][0], "http://localhost");
  expect(url.searchParams.has("from")).toBe(true);
  expect(url.searchParams.has("to")).toBe(true);
  expect(host.querySelector(".schedule-calendar")).toBeNull();
  expect(host.textContent).not.toContain("Synthetic patient");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
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
