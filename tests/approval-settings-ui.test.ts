// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConnectionApprovalSettings } from "@/features/access/approval-settings-view";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
let host: HTMLDivElement, root: Root;
async function mount(
  role: "patient" | "practitioner",
  initial = { enabled: false, categories: [] as string[], version: 0 },
) {
  request.mockImplementation(async (_path, input) =>
    input
      ? {
          ...input,
          categories: input.categories ?? [],
          version: input.version + 1,
        }
      : initial,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(ConnectionApprovalSettings, { role })),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
}
function toggle() {
  return document.querySelector<HTMLInputElement>('[role="switch"]')!;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  request.mockReset();
});
it("patient toggle saves immediately, with explicit explained scope and no second save action", async () => {
  await mount("patient");
  expect(request).toHaveBeenCalledWith("/api/connection-settings?role=patient");
  expect(toggle().checked).toBe(false);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "finalized health records",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain(
    "Save approval settings",
  );
  expect(document.querySelector("form")).toBeNull();
  await act(async () => toggle().click());
  expect(request).toHaveBeenCalledWith(
    "/api/connection-settings",
    expect.objectContaining({
      role: "patient",
      enabled: true,
      version: 0,
      categories: expect.arrayContaining(["allergy"]),
    }),
  );
  expect(toggle().checked).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Saved automatically.",
  );
  await act(async () => toggle().click());
  expect(request).toHaveBeenLastCalledWith(
    "/api/connection-settings",
    expect.objectContaining({ enabled: false, version: 1 }),
  );
  expect(toggle().checked).toBe(false);
});
it("professional toggle saves immediately without submitting patient categories", async () => {
  await mount("practitioner");
  await act(async () => toggle().click());
  expect(request).toHaveBeenCalledWith("/api/connection-settings", {
    role: "practitioner",
    enabled: true,
    version: 0,
  });
  expect(toggle().checked).toBe(true);
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it("a failed save restores the stored switch state and requires authoritative reload", async () => {
  await mount("practitioner");
  request.mockRejectedValueOnce(new Error("VERSION_CONFLICT"));
  await act(async () => toggle().click());
  expect(toggle().checked).toBe(false);
  expect(toggle().disabled).toBe(true);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "VERSION_CONFLICT",
  );
  await act(async () =>
    document.querySelector<HTMLButtonElement>('[role="alert"] button')!.click(),
  );
  expect(toggle().disabled).toBe(false);
  expect(document.querySelector('[role="alert"]')).toBeNull();
});
it("toggling an existing limited patient scope never widens its categories", async () => {
  await mount("patient", {
    enabled: false,
    categories: ["allergy"],
    version: 4,
  });
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Your scope: Allergies",
  );
  await act(async () => toggle().click());
  expect(request).toHaveBeenCalledWith("/api/connection-settings", {
    role: "patient",
    enabled: true,
    version: 4,
    categories: ["allergy"],
  });
});
it("a pending save disables further changes until its result arrives", async () => {
  await mount("practitioner");
  let finish!: (value: unknown) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => toggle().click());
  expect(toggle().disabled).toBe(true);
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Saving...",
  );
  await act(async () => toggle().click());
  expect(
    request.mock.calls.filter((call) => call[0] === "/api/connection-settings"),
  ).toHaveLength(1);
  await act(async () => finish({ enabled: true, categories: [], version: 1 }));
  expect(toggle().disabled).toBe(false);
  expect(toggle().checked).toBe(true);
});
