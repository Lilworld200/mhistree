// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ApplicationFlow } from "@/features/professional-onboarding/application";
import { AccountEntry } from "@/features/patient/account/entry";
import { ProfessionalAuthForm } from "@/features/professional-onboarding/auth-form";
const { call, replace, refresh } = vi.hoisted(() => ({
  call: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/lib/client-api", () => ({
  api: call,
  errorMessage: (err: Error) => err.message,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock("next/image", () => ({
  default: () => createElement("img", { alt: "Mhistree" }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
async function mount(element: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.resetAllMocks();
});
async function fill(name: string, value: string) {
  await act(async () => {
    const input = host.querySelector(`[name="${name}"]`)! as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      input.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function click(label: string) {
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent?.includes(label))!
      .click(),
  );
}
it("organization application preserves details across stages and submits only after review", async () => {
  call.mockResolvedValue({ id: "synthetic-org" });
  await mount(createElement(ApplicationFlow, { entry: "organization" }));
  await fill("legalName", "Synthetic Care Clinic");
  await fill("registrationNumber", "TEST-ORG");
  await fill("jurisdiction", "Synthetic jurisdiction");
  await submit();
  expect(call).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Location & administrator authority");
  await fill("address", "Synthetic operating address");
  await fill(
    "administratorCapacity",
    "I am the authorized administrator of this synthetic organization.",
  );
  await submit();
  expect(host.textContent).toContain("Application summary");
  expect(host.textContent).toContain("Synthetic Care Clinic");
  expect(call).not.toHaveBeenCalled();
  await click("Back");
  expect(
    (host.querySelector('[name="address"]') as HTMLTextAreaElement).value,
  ).toBe("Synthetic operating address");
  await submit();
  await act(async () =>
    (host.querySelector('[name="declaration"]') as HTMLInputElement).click(),
  );
  await submit();
  expect(call).toHaveBeenCalledOnce();
  expect(call.mock.calls[0][0]).toBe("/api/organizations");
  expect(call.mock.calls[0][1]).toMatchObject({
    legalName: "Synthetic Care Clinic",
    registrationNumber: "TEST-ORG",
    jurisdiction: "Synthetic jurisdiction",
    address: "Synthetic operating address",
  });
  expect(host.textContent).toContain(
    "Your application is with our review team",
  );
  expect(call.mock.calls[0][1]).not.toHaveProperty("profession");
});
it("professional flow requires credential evidence and never creates clinical privileges", async () => {
  await mount(
    createElement(ApplicationFlow, {
      entry: "practitioner",
      initialProfile: { profile: null, applications: [] },
    }),
  );
  await fill("legalName", "Synthetic Professional");
  await fill("profession", "Pharmacist");
  await fill("registrationNumber", "TEST-LICENCE");
  await fill("jurisdiction", "Synthetic jurisdiction");
  await submit();
  expect(host.textContent).toContain("Add your registration evidence");
  await submit();
  expect(host.textContent).toContain("Choose a credential PDF");
  expect(call).not.toHaveBeenCalled();
  const input = host.querySelector('[name="credential"]') as HTMLInputElement;
  const file = new File(["%PDF-synthetic"], "licence.pdf", {
    type: "application/pdf",
  });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new TextEncoder().encode("%PDF-synthetic").buffer,
  });
  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [file],
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await submit();
  expect(host.textContent).toContain("licence.pdf");
  call.mockResolvedValue({ id: "synthetic-professional" });
  await submit();
  expect(call).not.toHaveBeenCalled();
  await act(async () =>
    (host.querySelector('[name="declaration"]') as HTMLInputElement).click(),
  );
  await submit();
  expect(call.mock.calls[0][0]).toBe("/api/practitioner");
  expect(call.mock.calls[0][1]).toMatchObject({
    profession: "Pharmacist",
    filename: "licence.pdf",
  });
  expect(call.mock.calls[0][1]).not.toHaveProperty("privileges");
  expect(host.textContent).toContain("Under review");
});
it("pending professional applications show status instead of another submission form", async () => {
  await mount(
    createElement(ApplicationFlow, {
      entry: "practitioner",
      initialProfile: {
        profile: { status: "pending", version: 1, privileges: [] },
        applications: [
          {
            id: "test",
            legal_name: "Synthetic Applicant",
            profession: "Nurse",
          },
        ],
      },
    }),
  );
  expect(host.querySelector("form")).toBeNull();
  expect(host.textContent).toContain("Under review");
  expect(call).not.toHaveBeenCalled();
});
it("professional account registration validates matching passwords then shows email verification", async () => {
  await mount(
    createElement(ProfessionalAuthForm, {
      entry: "organization",
    }),
  );
  await fill("displayName", "Synthetic Administrator");
  await fill("email", "synthetic@example.com");
  await fill("password", "Synthetic-password-123");
  await fill("confirm", "different-password");
  await submit();
  expect(host.textContent).toContain("passwords do not match");
  expect(call).not.toHaveBeenCalled();
  await fill("confirm", "Synthetic-password-123");
  call.mockResolvedValue({ verificationRequired: true });
  await submit();
  expect(call.mock.calls[0][0]).toBe("/api/auth/signup");
  expect(call.mock.calls[0][1]).toMatchObject({
    entry: "organization",
    displayName: "Synthetic Administrator",
  });
  expect(host.textContent).toContain("Check your inbox");
  expect(host.textContent).toContain("synthetic@example.com");
  expect(host.querySelector('[type="password"]')).toBeNull();
});
it("shared sign-in retries normally for a registered practitioner or administrator", async () => {
  await mount(createElement(AccountEntry));
  await fill("identifier", "synthetic@example.com");
  await fill("password", "synthetic-password");
  call.mockRejectedValueOnce(Error("PROVIDER_UNAVAILABLE"));
  await submit();
  expect(replace).not.toHaveBeenCalled();
  call.mockResolvedValueOnce({ next: "/auth/professional/practitioner" });
  await submit();
  expect(replace).toHaveBeenCalledWith("/chat");
  expect(call.mock.calls[1][1]).not.toHaveProperty("entry");
});
