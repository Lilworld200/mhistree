// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PatientControlsView } from "@/features/access/patient-controls-view";
import { MobileTopbarTarget } from "@/components/layout/mobile-topbar-actions";
import type { Connection } from "@/features/access/sharing-types";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
let root: Root, host: HTMLDivElement, mobileBar: HTMLDivElement | undefined;
const direct: Connection = {
  id: "connection-one",
  kind: "direct",
  status: "active",
  revision: 2,
  display_name: "Dr. Synthetic Doctor",
  practitioner_account_id: "doctor-one",
  categories: ["allergy"],
  exclusions: [],
  method: "login",
  recorded_at: "2026-10-22T12:00:00Z",
};
const pending: Connection = {
  ...direct,
  id: "connection-two",
  kind: "organization",
  status: "pending",
  display_name: "Synthetic Clinic",
  practitioner_account_id: null,
};
async function mount(
  connections: Connection[] = [direct, pending],
  withMobileBar = false,
) {
  request.mockImplementation(
    async (_path: string, input?: { action: string }) =>
      input?.action === "history"
        ? {
            items: [
              {
                id: "1",
                actor_name: "Dr. Synthetic Doctor",
                action: "record.read",
                recorded_at: "2026-10-22T12:00:00Z",
                connection_name: "Dr. Synthetic Doctor",
                context_label: "Direct practitioner",
              },
            ],
            nextCursor: null,
          }
        : input?.action === "search"
          ? {
              items: [
                {
                  id: "doctor-new",
                  display_name: "Dr. New Doctor",
                  profession: "Medical doctor",
                  jurisdiction: "Demo",
                },
              ],
              hasMore: false,
            }
          : { connections, requests: [] },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  if (withMobileBar) {
    mobileBar = document.createElement("div");
    document.body.append(mobileBar);
  }
  await act(async () => {
    root.render(
      createElement(
        MobileTopbarTarget.Provider,
        { value: mobileBar ?? null },
        createElement(PatientControlsView),
      ),
    );
  });
}
function button(text: string) {
  const found = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent?.trim() === text);
  if (!found) throw Error(`Missing button: ${text}`);
  return found;
}
afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  mobileBar?.remove();
  mobileBar = undefined;
  request.mockReset();
});
it("mobile top-bar action opens history and returns focus; redundant overview cards are removed", async () => {
  await mount([], true);
  expect(host.querySelector(".sharing-overview")).toBeNull();
  expect(host.textContent).not.toContain("You’re in control");
  expect(host.querySelector(".sharing-desktop-header h1")?.textContent).toBe(
    "Sharing",
  );
  const trigger = mobileBar!.querySelector<HTMLButtonElement>("button")!;
  expect(trigger.textContent).toBe("Access history");
  trigger.focus();
  await act(async () => trigger.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Access history",
  );
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close panel"]')!
      .click(),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(document.activeElement).toBe(trigger);
});
it("fresh reconnection can deliberately review a previously excluded category", async () => {
  await mount([{ ...direct, status: "revoked", exclusions: ["allergy"] }]);
  await act(async () => button("Ended connections").click());
  await act(async () => button("Review reconnection").click());
  const allergy = document.querySelector<HTMLInputElement>(
    'input[value="allergy"]',
  )!;
  expect(allergy.disabled).toBe(false);
  await act(async () => allergy.click());
  await act(async () =>
    document
      .querySelector<HTMLFormElement>(".sharing-consent-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith("/api/connections", {
    action: "consent",
    data: {
      connectionId: direct.id,
      version: 2,
      mode: "reconnect",
      categories: ["allergy"],
      exclusions: [],
    },
  });
});
it("separates connections and requests, and opens named history with focus return", async () => {
  await mount();
  expect(host.textContent).toContain("Dr. Synthetic Doctor");
  expect(host.textContent).not.toContain("Synthetic Clinic");
  await act(async () => button("Requests1").click());
  expect(host.textContent).toContain("Synthetic Clinic");
  const trigger = button("Access history");
  trigger.focus();
  await act(async () => trigger.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Viewed a health record entry",
  );
  expect(request).toHaveBeenCalledWith("/api/connections", {
    action: "history",
    data: {},
  });
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close panel"]')!
      .click(),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(document.activeElement).toBe(trigger);
});
it("search is read-only until the patient reviews and confirms categories", async () => {
  await mount([]);
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, "Doctor");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector<HTMLFormElement>(".sharing-search")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  await act(async () => button("Review sharing").click());
  expect(request.mock.calls.some((call) => call[1]?.action === "connect")).toBe(
    false,
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "What can they access?",
  );
  await act(async () =>
    document
      .querySelector<HTMLFormElement>(".sharing-consent-form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(request).toHaveBeenCalledWith(
    "/api/connections",
    expect.objectContaining({
      action: "connect",
      data: expect.objectContaining({
        practitionerId: "doctor-new",
        categories: expect.arrayContaining(["allergy"]),
      }),
    }),
  );
});
it("narrowing cannot enable categories outside the active grant, and revocation requires confirmation", async () => {
  await mount([direct]);
  await act(async () => button("Manage access").click());
  expect(
    document.querySelector<HTMLInputElement>('input[value="clinical"]')
      ?.disabled,
  ).toBe(true);
  await act(async () => button("End connection").click());
  expect(request.mock.calls.some((call) => call[1]?.action === "revoke")).toBe(
    false,
  );
  await act(async () => button("Confirm end of access").click());
  expect(request).toHaveBeenCalledWith("/api/connections", {
    action: "revoke",
    data: { id: direct.id },
  });
});
