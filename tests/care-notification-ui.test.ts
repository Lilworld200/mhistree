// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppShell } from "@/components/layout/app-shell";
import { PatientsView } from "@/features/practitioner/patients-view";
import { TodayView } from "@/features/practitioner/today-view";
import {
  CareNotificationProvider,
  useCareNotifications,
} from "@/features/practitioner/notification-context";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/clinician/dashboard",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/image", () => ({
  default: () => createElement("img", { alt: "Mhistree" }),
}));
let root: Root, host: HTMLDivElement;
async function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(node));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.useRealTimers();
  vi.clearAllMocks();
});
const snapshot = {
  connections: [{ connectionId: "patient-connection", unread: 1 }],
  limited: false,
};
it("one snapshot flags the menu, Today shortcut and only the affected patient card", async () => {
  request.mockResolvedValue(snapshot);
  const daily = {
    items: [],
    availability: [],
    notifications: [],
    limited: false,
  };
  await mount(
    createElement(
      AppShell,
      {
        workspaces: {
          practitioner: true,
          professionalProfile: true,
          organizations: false,
        },
      },
      createElement(TodayView, { initial: daily }),
      createElement(PatientsView, {
        initial: [
          {
            id: "patient-connection",
            patient_person_id: "patient",
            display_name: "Patient With Message",
            status: "active",
          },
          {
            id: "quiet-connection",
            patient_person_id: "quiet",
            display_name: "Quiet Patient",
            status: "active",
          },
        ],
      }),
    ),
  );
  for (const path of [
    "/clinician/dashboard",
    "/clinician/patients",
    "/clinician/inbox",
  ]) {
    expect(
      host.querySelector(
        `.nav-body a[href="${path}"] [aria-label="New care message"]`,
      ),
    ).not.toBeNull();
  }
  expect(
    host.querySelector(
      '.daily-shortcuts a[href="/clinician/inbox"] .care-notification-dot',
    ),
  ).not.toBeNull();
  expect(
    host.querySelector(
      'a[href="/clinician/patients/patient-connection"] .care-notification-dot',
    ),
  ).not.toBeNull();
  expect(
    host.querySelector(
      'a[href="/clinician/patients/quiet-connection"] .care-notification-dot',
    ),
  ).toBeNull();
  expect(
    request.mock.calls.filter(
      (c) => c[0] === "/api/practitioner/notifications",
    ),
  ).toHaveLength(1);
});
function Probe() {
  const { snapshot, refresh } = useCareNotifications();
  return createElement(
    "button",
    { onClick: () => void refresh() },
    String(snapshot.connections.length),
  );
}
it("StrictMode, focus and polling share an in-flight request; failures clear stale badges", async () => {
  vi.useFakeTimers();
  let resolve!: (value: typeof snapshot) => void;
  request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount(
    createElement(
      StrictMode,
      null,
      createElement(
        CareNotificationProvider,
        { enabled: true },
        createElement(Probe),
      ),
    ),
  );
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => resolve(snapshot));
  expect(host.textContent).toBe("1");
  request.mockRejectedValueOnce(new Error("SESSION_RETIRED"));
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toBe("0");
});
