// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PatientAssistant } from "@/features/practitioner/patient-assistant";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/client-api", () => ({
  api: request,
  errorMessage: (e: Error) => e.message,
}));
let root: Root, host: HTMLDivElement;
const medication = {
  id: "20000000-0000-4000-8000-000000000001",
  category: "prescription",
  body: {
    text: "I prescribe Quata 250 mg morning and night.",
    bodySite: null,
    contextLinks: [],
    careDetails: { name: "Quata", indication: "malaria" },
  },
  medicationDetails: {
    name: "Quata",
    dose: "250 mg",
    frequency: "morning and night",
  },
  occurredAt: { precision: "unknown" },
  status: "unknown",
  sourceSpans: ["I prescribe Quata 250 mg morning and night."],
  missingDetails: [],
};
const condition = {
  ...medication,
  id: "20000000-0000-4000-8000-000000000002",
  category: "ongoing",
  body: {
    text: "Suspected malaria.",
    bodySite: null,
    contextLinks: [],
    careDetails: { name: "malaria", certainty: "suspected" },
  },
  medicationDetails: null,
  sourceSpans: ["Suspected malaria."],
};
const turn = {
  id: "10000000-0000-4000-8000-000000000001",
  question: "Suspected malaria. I prescribe Quata 250 mg morning and night.",
  text: "Review these findings.",
  proposals: [condition, medication],
  evidenceIds: [],
  limitations: [],
};
const version = {
  id: "30000000-0000-4000-8000-000000000001",
  text: "Reviewed prescription: Quata 500 mg morning and night.",
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
function button(text: string) {
  return [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
}
async function click(text: string) {
  await act(async () => button(text).click());
}
async function input(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function mount(items: unknown[] = [turn]) {
  request.mockImplementation(
    async (_path: string, body?: { action: string }) => {
      if (!body) return { items, nextCursor: null };
      if (body.action === "ai-review") return version;
      if (body.action === "ai-review-confirm")
        return {
          ...turn,
          id: "saved",
          question: version.text,
          text: "Reviewed findings saved.",
          proposals: [],
        };
      return { ...turn, id: "new", question: "New question", proposals: [] };
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(PatientAssistant, {
        connectionId: "connection",
        writableCategories: ["ongoing", "prescription"],
      }),
    ),
  );
}
async function submit(text: string) {
  await input(
    host.querySelector<HTMLTextAreaElement>("#patient-ai-question")!,
    text,
  );
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  request.mockReset();
});
it("reloads saved conversation and shows a single card with condition and prescription fields", async () => {
  await mount();
  expect(request.mock.calls[0][0]).toContain("view=ai-chat");
  expect(host.textContent).toContain(turn.question);
  expect(host.querySelectorAll('[aria-label="Review findings"]')).toHaveLength(
    1,
  );
  expect([...host.querySelectorAll("input")].map((i) => i.value)).toContain(
    "Quata",
  );
  expect([...host.querySelectorAll("input")].map((i) => i.value)).toContain(
    "malaria",
  );
  expect(host.querySelectorAll("input[type=radio]")).toHaveLength(2);
  expect(host.textContent).toContain("does not mean the patient is taking");
});
it("sends edited fields for review and only publishes after the exact displayed confirmation", async () => {
  await mount();
  const dose = [...host.querySelectorAll("input")].find(
    (i) => i.value === "250 mg",
  )!;
  await input(dose, "500 mg");
  const review = [
    ...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
  ].at(-1)!;
  await act(async () => review.click());
  await click("Review message");
  const edit = request.mock.calls.find((c) => c[1]?.action === "ai-review")![1];
  expect(edit.data.items).toHaveLength(2);
  expect(edit.data.items[1].fields.dose).toBe("500 mg");
  expect(
    request.mock.calls.some((c) => c[1]?.action === "ai-review-confirm"),
  ).toBe(false);
  expect(host.textContent).toContain(version.text);
  await submit("okay");
  expect(
    request.mock.calls.find((c) => c[1]?.action === "ai-review-confirm")![1]
      .data,
  ).toEqual({ reviewId: version.id, reviewed: true });
  expect(host.querySelector('[aria-label="Review findings"]')).toBeNull();
  expect(host.textContent).toContain(version.text);
});
it("allows typed clarification and never treats an unbound okay as publication", async () => {
  await mount();
  await submit("okay");
  expect(request.mock.calls.at(-1)![1].action).toBe("ai");
  expect(
    request.mock.calls.some((c) => c[1]?.action === "ai-review-confirm"),
  ).toBe(false);
});
it("editing a prepared card invalidates its Send binding and retains the edited fields on failure", async () => {
  await mount();
  await act(async () =>
    [...host.querySelectorAll<HTMLInputElement>("input[type=checkbox]")]
      .at(-1)!
      .click(),
  );
  await click("Review message");
  await input(
    [...host.querySelectorAll("input")].find((i) => i.value === "250 mg")!,
    "750 mg",
  );
  expect(button("Send reviewed message")).toBeUndefined();
  request.mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));
  await submit("Use 750 mg");
  expect(host.textContent).toContain("DATABASE_UNAVAILABLE");
  expect(
    [...host.querySelectorAll("input")].some((i) => i.value === "750 mg"),
  ).toBe(true);
  expect(
    host.querySelector<HTMLTextAreaElement>("#patient-ai-question")!.value,
  ).toBe("Use 750 mg");
});
