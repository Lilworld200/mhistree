// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CareNotesView } from "@/features/clinical-care/care-notes-view";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
const saved = vi.fn(),
  denied = vi.fn();
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.resetAllMocks();
});
async function mount(
  categories = [
    "clinical",
    "medication-use",
    "prescription",
    "ongoing",
    "allergy",
    "baseline",
    "symptom",
    "activity",
  ],
) {
  request.mockResolvedValue({});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(CareNotesView, {
        connectionId: crypto.randomUUID(),
        patientPersonId: crypto.randomUUID(),
        writableCategories: categories,
        onSaved: saved,
        onDenied: denied,
      }),
    ),
  );
}
function button(text: string) {
  const b = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent?.trim() === text,
  );
  if (!b) throw Error(`Missing button ${text}`);
  return b;
}
function field(label: string) {
  const l = [...host.querySelectorAll("label")].find((l) =>
    l.textContent?.trim().startsWith(label),
  );
  const el = l?.querySelector<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("input,textarea,select");
  if (!el) throw Error(`Missing field ${label}`);
  return el;
}
async function fill(label: string, value: string) {
  await act(async () => {
    const el = field(label),
      prototype =
        el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : el.tagName === "SELECT"
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function switchToRecord() {
  await act(async () => field("Patient Record").click());
}
async function review() {
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
}
it("offers just the two destination choices and preserves independent form drafts", async () => {
  await mount();
  expect((field("Private Note") as HTMLInputElement).checked).toBe(true);
  expect((field("Patient Record") as HTMLInputElement).checked).toBe(false);
  expect(host.textContent).not.toContain("Save private work");
  expect(
    [...host.querySelectorAll("label")].some(
      (l) => l.textContent?.trim() === "Type",
    ),
  ).toBe(false);
  await fill("Private note", "My private thinking.");
  await switchToRecord();
  await fill("Record category", "ongoing");
  await fill("Condition / issue", "Synthetic issue");
  expect(button("Save Patient Record")).toBeTruthy();
  expect(host.textContent).not.toContain("Reminder time");
  await act(async () => field("Private Note").click());
  expect(field("Private note").value).toBe("My private thinking.");
  await switchToRecord();
  expect(field("Condition / issue").value).toBe("Synthetic issue");
  expect(request).not.toHaveBeenCalled();
});
it("shows category-specific medication, allergy and baseline inputs without inferring use from a prescription", async () => {
  await mount();
  await switchToRecord();
  await fill("Record category", "prescription");
  expect(field("Medication name")).toBeTruthy();
  expect(field("Dose")).toBeTruthy();
  expect(field("Frequency")).toBeTruthy();
  expect(field("What is this medication for?").tagName).toBe("TEXTAREA");
  expect(host.textContent).not.toContain("Actual medication use");
  await fill("Record category", "medication-use");
  expect(field("Actual medication use").value).toBe("");
  await fill("Record category", "allergy");
  expect(field("Allergen / substance")).toBeTruthy();
  expect(field("Reaction (if known)")).toBeTruthy();
  expect(field("Certainty").value).toBe("suspected");
  await fill("Record category", "baseline");
  expect(field("Usual value / description")).toBeTruthy();
  expect(field("Unit (if applicable)")).toBeTruthy();
});
it("submits a reviewed structured record directly and blocks incomplete medication fields", async () => {
  await mount();
  await switchToRecord();
  await fill("Record category", "medication-use");
  await fill("Medication name", "Synthetic medicine");
  await fill("Dose", "10 mg");
  await fill("Actual medication use", "taking");
  await review();
  await submit();
  expect(request).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Enter the medication frequency");
  await fill("Frequency", "once daily");
  await fill(
    "What is this medication for?",
    "For the symptom reviewed during this consultation.",
  );
  expect(
    host.querySelector('[aria-label="Patient record preview"]')?.textContent,
  ).toContain(
    "Reason for medication: For the symptom reviewed during this consultation.",
  );
  await review();
  await submit();
  expect(request.mock.calls[0][1]).toMatchObject({
    action: "save-note",
    data: {
      destination: "record",
      category: "medication-use",
      reviewed: true,
      fields: {
        name: "Synthetic medicine",
        dose: "10 mg",
        frequency: "once daily",
        indication: "For the symptom reviewed during this consultation.",
        useStatus: "taking",
      },
    },
  });
  expect(request.mock.calls.some(([, body]) => body?.action === "ai")).toBe(
    false,
  );
  expect(saved).toHaveBeenCalledTimes(1);
});
it("retains private input and the same operation key after a failed save", async () => {
  await mount();
  await fill("Private note", "Keep this unsaved input.");
  request.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
  await submit();
  expect(field("Private note").value).toBe("Keep this unsaved input.");
  const key = request.mock.calls[0][1].data.requestKey;
  await submit();
  expect(request.mock.calls[1][1].data.requestKey).toBe(key);
  expect(host.textContent).toContain("Private note saved");
});
it("browses previous author-only notes and saves edits without a patient-record history action", async () => {
  await mount();
  request.mockResolvedValue({
    items: [
      {
        id: crypto.randomUUID(),
        category: "clinical",
        body: { text: "Earlier private note" },
        version: 1,
        state: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
    nextCursor: null,
  });
  await act(async () => button("Previous private notes").click());
  expect(request.mock.calls[0][0]).toContain("view=private-notes");
  expect(host.textContent).toContain("Earlier private note");
  expect(
    host.querySelector('section[aria-label="Patient record preview"]'),
  ).toBeNull();
  await act(async () => button("Edit private note").click());
  await fill("Edit private note", "Edited private note");
  await act(async () => button("Save Private Note").click());
  expect(
    request.mock.calls.some(
      ([, body]) =>
        body?.action === "edit" &&
        body.data.body.text === "Edited private note",
    ),
  ).toBe(true);
});
it("limits category choices to current writable scope and disables saving with read-only access", async () => {
  await mount([]);
  expect(button("Save Private Note").disabled).toBe(true);
  await switchToRecord();
  expect(button("Save Patient Record").disabled).toBe(true);
  expect(host.querySelectorAll("select option")).toHaveLength(4);
});
