// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProfileView, type Profile } from "@/features/patient/account/profile";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
let host: HTMLDivElement, root: Root;
const initial: Profile = {
  accountId: "internal-account-reference",
  patientId: "MH-synthetic-public-id",
  display_name: "Synthetic Patient",
  birth_date: null,
  profile_version: 3,
  login_identifier: "person@example.test",
  loginEmail: "person@example.test",
  contacts: [
    {
      id: "login-contact",
      kind: "email",
      address: "person@example.test",
      verified_at: "2026-10-25T08:00:00Z",
    },
    {
      id: "phone-contact",
      kind: "phone",
      address: "+2348000000000",
      verified_at: null,
    },
  ],
};
async function render() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(ProfileView, { initial })));
}
async function edit() {
  await act(async () =>
    host.querySelector<HTMLButtonElement>(".profile-edit-trigger")!.click(),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  request.mockReset();
});
it("shows the public patient locator in the original hero and keeps editing out of the page", async () => {
  await render();
  const hero = host.querySelector("header.hero")!;
  expect(hero.textContent).toContain(initial.patientId);
  expect(hero.textContent).toContain(initial.display_name);
  expect(hero.textContent).not.toContain(initial.accountId);
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).not.toContain("Organization invitation identifier");
  expect(host.textContent).not.toContain("Private login identifier");
  expect(
    hero
      .querySelector(".profile-edit-trigger")
      ?.lastElementChild?.tagName.toLowerCase(),
  ).toBe("svg");
  expect(host.textContent).toContain("Not added");
  expect(host.textContent).toContain("Sign-in email");
});
it("edits details in a panel with an expected version and closes only after authoritative refresh", async () => {
  await render();
  await edit();
  const form = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
  form.querySelector<HTMLInputElement>('[name="displayName"]')!.value =
    "Updated Patient";
  form.querySelector<HTMLInputElement>('[name="birthDate"]')!.value =
    "1995-03-12";
  request
    .mockResolvedValueOnce({})
    .mockResolvedValueOnce({
      ...initial,
      display_name: "Updated Patient",
      birth_date: "1995-03-12",
      profile_version: 4,
    });
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(request).toHaveBeenCalledWith("/api/account", {
    action: "profile",
    data: {
      displayName: "Updated Patient",
      birthDate: "1995-03-12",
      version: 3,
    },
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain("Updated Patient");
});
it("retains unsaved edits on conflict and never offers ordinary removal of the login email", async () => {
  await render();
  await edit();
  const form = document.querySelector<HTMLFormElement>('[role="dialog"] form')!;
  form.querySelector<HTMLInputElement>('[name="displayName"]')!.value =
    "Unsaved Name";
  request.mockRejectedValueOnce(new Error("VERSION_CONFLICT"));
  await act(async () =>
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    ),
  );
  expect(
    document.querySelector<HTMLInputElement>('[name="displayName"]')?.value,
  ).toBe("Unsaved Name");
  const login = [...document.querySelectorAll(".profile-edit-contact")].find(
    (el) => el.textContent?.includes(initial.loginEmail!),
  )!;
  expect(login.querySelector("button")).toBeNull();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "VERSION_CONFLICT",
  );
});
it("session loss clears the profile and closes its editor", async () => {
  await render();
  await edit();
  request.mockRejectedValueOnce(new Error("SESSION_RETIRED"));
  await act(async () =>
    document
      .querySelector<HTMLFormElement>('[role="dialog"] form')!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).not.toContain(initial.patientId);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
