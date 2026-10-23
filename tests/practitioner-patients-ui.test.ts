// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PatientsView } from "@/features/practitioner/patients-view";
import type { DirectPatient } from "@/features/practitioner/patient-types";
const request = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
let host: HTMLDivElement, root: Root;
const rows: DirectPatient[] = [
  {
    id: "active-id",
    patient_person_id: "person-one",
    display_name: "Connected Patient",
    status: "active",
    categories: ["allergy"],
  },
  {
    id: "pending-id",
    patient_person_id: "person-two",
    display_name: "Pending Patient",
    status: "pending",
  },
  {
    id: "ended-id",
    patient_person_id: "person-three",
    display_name: "Past Patient",
    status: "revoked",
  },
];
const capabilities = { lookup: true, register: true, connect: true };
async function mount(allowed = capabilities) {
  request.mockImplementation(
    async (_path: string, input?: { action: string }) =>
      input?.action === "lookup"
        ? [
            {
              personId: "candidate",
              displayName: "Synthetic Candidate",
              reviewRequired: true,
            },
          ]
        : input?.action === "register"
          ? { alias: "SYNTHETIC-ID" }
          : input?.action === "connect"
            ? { id: "new", status: "pending" }
            : rows,
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(PatientsView, {
        initial: rows,
        assigned: [
          {
            assignment_id: "assignment",
            organization_id: "org",
            organization_name: "Synthetic Clinic",
            connection_id: "org-connection",
            display_name: "Assigned Patient",
          },
        ],
        capabilities: allowed,
      }),
    ),
  );
}
function button(label: string) {
  const b = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (el) => el.textContent?.trim() === label,
  );
  if (!b) throw Error(`Missing ${label}`);
  return b;
}
async function submit(selector: string) {
  await act(async () =>
    document
      .querySelector<HTMLFormElement>(selector)!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  request.mockReset();
});
it("separates direct, organization, pending and ended contexts with no unauthorized record links", async () => {
  await mount();
  expect(host.textContent).toContain("Connected Patient");
  expect(
    host.querySelector('a[href="/clinician/patients/active-id"]'),
  ).not.toBeNull();
  await act(async () => button("Pending requests1").click());
  expect(host.textContent).toContain("Pending Patient");
  expect(host.querySelector('a[href*="/clinician/patients/"]')).toBeNull();
  await act(async () => button("Ended connections1").click());
  expect(host.textContent).toContain("Past Patient");
  expect(host.querySelector('a[href*="/clinician/patients/"]')).toBeNull();
  await act(async () => button("Organization patients1").click());
  expect(host.querySelector("a")?.getAttribute("href")).toBe(
    "/organizations/record?organization=org&connection=org-connection&assignment=assignment",
  );
});
it("lookup is read-only until requested categories are deliberately submitted", async () => {
  await mount();
  const trigger = button("Add patient");
  trigger.focus();
  await act(async () => trigger.click());
  document.querySelector<HTMLInputElement>('input[name="alias"]')!.value =
    "SYNTHETIC";
  await submit(".practitioner-lookup");
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Synthetic Candidate",
  );
  expect(request.mock.calls.some((call) => call[1]?.action === "connect")).toBe(
    false,
  );
  await act(async () => button("Review connection request").click());
  await submit(".practitioner-panel-form");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "Choose at least one",
  );
  await act(async () =>
    document.querySelector<HTMLInputElement>('input[value="allergy"]')!.click(),
  );
  await submit(".practitioner-panel-form");
  expect(request).toHaveBeenCalledWith(
    "/api/practitioner/patients",
    expect.objectContaining({
      action: "connect",
      data: expect.objectContaining({
        patientPersonId: "candidate",
        method: "login",
        categories: ["allergy"],
        exclusions: [],
      }),
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(document.activeElement).toBe(trigger);
});
it("registration preserves no-contact identity and displays the real locator receipt", async () => {
  await mount();
  await act(async () => button("Add patient").click());
  await act(async () => button("Register person").click());
  document.querySelector<HTMLInputElement>('input[name="name"]')!.value =
    "Synthetic new person";
  await submit(".practitioner-panel-form");
  expect(request).toHaveBeenCalledWith("/api/practitioner/patients", {
    action: "register",
    data: {
      displayName: "Synthetic new person",
      birthDate: null,
      contacts: [],
    },
  });
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "SYNTHETIC-ID",
  );
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "A login has not been created",
  );
});
it("hides lookup/registration actions without the corresponding server-projected capabilities", async () => {
  await mount({ lookup: false, register: false, connect: false });
  expect(host.textContent).not.toContain("Add patient");
  expect(host.textContent).toContain("Connected Patient");
});
