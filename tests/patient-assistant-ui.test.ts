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
const onSaved = vi.fn(),
  onDenied = vi.fn();
const candidate = {
  id: "item-one",
  category: "medication-use",
  body: {
    text: "Patient takes Omeprazole 20 mg once daily.",
    medication: { useStatus: "taking" },
  },
  occurredAt: { precision: "unknown" },
  status: "unknown",
  sourceSpans: ["Patient takes Omeprazole 20 mg once daily."],
  medicationDetails: {
    name: "Omeprazole",
    dose: "20 mg",
    frequency: "once daily",
  },
  missingDetails: [],
};
const reply = {
  id: "run-one",
  text: "Save to medications or keep a private note?",
  evidenceIds: [],
  limitations: [],
  proposals: [candidate],
};
async function mount(writableCategories = ["medication-use"]) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(PatientAssistant, {
        connectionId: "connection-one",
        writableCategories,
        onSaved,
        onDenied,
      }),
    ),
  );
}
async function send(text: string) {
  const field = host.querySelector("#patient-ai-question")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
function button(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(label),
  )!;
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  request.mockReset();
  onSaved.mockReset();
  onDenied.mockReset();
});
it("read-only users can ask but see no write or note actions even if a response contains a proposal", async () => {
  await mount([]);
  request.mockResolvedValue(reply);
  await send("What is the medication history?");
  expect(host.textContent).toContain("Read-only assistance");
  expect(host.querySelector(".patient-ai-review")).toBeNull();
  expect(request.mock.calls.every((call) => call[1].action === "ai")).toBe(
    true,
  );
});
it("clarifies across turns and publishes only after explicit reviewed confirmation, retaining input on save failure", async () => {
  await mount();
  request.mockResolvedValueOnce({
    ...reply,
    text: "How often is it taken?",
    proposals: [{ ...candidate, missingDetails: ["Clarify frequency."] }],
  });
  await send("Patient takes Omeprazole 20 mg.");
  expect(button("Yes, save").disabled).toBe(true);
  expect(button("No, save as private note").disabled).toBe(false);
  request.mockResolvedValueOnce({
    ...reply,
    id: "run-two",
    proposals: [{ ...candidate, id: "item-two" }],
  });
  await send("Once daily.");
  expect(request).toHaveBeenLastCalledWith("/api/practitioner/workspace", {
    connectionId: "connection-one",
    action: "ai",
    data: {
      question: "Once daily.",
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
      timezone: expect.any(String),
      previousRunId: "run-one",
    },
  });
  expect(request.mock.calls.every((call) => call[1].action === "ai")).toBe(
    true,
  );
  request.mockRejectedValueOnce(new Error("PROVIDER_UNAVAILABLE"));
  await act(async () => button("Yes, save").click());
  expect(
    host.querySelector<HTMLTextAreaElement>(".patient-ai-review textarea")
      ?.value,
  ).toBe(candidate.body.text);
  expect(host.textContent).not.toContain("Saved to timeline");
  request.mockResolvedValueOnce({
    destination: "record",
    eventId: "event-one",
  });
  await act(async () => button("Yes, save").click());
  expect(request).toHaveBeenLastCalledWith("/api/practitioner/workspace", {
    connectionId: "connection-one",
    action: "ai-save",
    data: {
      runId: "run-two",
      itemId: "item-two",
      destination: "record",
      reviewed: true,
      text: candidate.body.text,
    },
  });
  expect(host.textContent).toContain("Saved to timeline & medications");
  expect(onSaved).toHaveBeenCalledTimes(1);
});
it("the no choice explicitly saves a private note and reports no change to the patient record", async () => {
  await mount();
  request.mockResolvedValueOnce(reply);
  await send(candidate.body.text);
  request.mockResolvedValueOnce({ destination: "note", workId: "note-one" });
  await act(async () => button("No, save as private note").click());
  expect(request.mock.calls.at(-1)?.[1].data.destination).toBe("note");
  expect(host.textContent).toContain("Saved as your private note");
  expect(host.textContent).toContain("patient's record was not changed");
  expect(host.querySelector(".patient-ai-review")).toBeNull();
});
it("revoked confirmation clears proposals and asks the owning workspace to recheck access", async () => {
  await mount();
  request.mockResolvedValueOnce(reply);
  await send(candidate.body.text);
  request.mockRejectedValueOnce(new Error("ACCESS_DENIED"));
  await act(async () => button("Yes, save").click());
  expect(onDenied).toHaveBeenCalledTimes(1);
  expect(host.querySelector(".patient-ai-review")).toBeNull();
  expect(host.textContent).not.toContain(candidate.body.text);
});
it("keeps outstanding review choices available after a conversational yes, without silently publishing", async () => {
  await mount();
  request.mockResolvedValueOnce(reply);
  await send(candidate.body.text);
  request.mockResolvedValueOnce({
    ...reply,
    id: "run-two",
    text: "Use the review choice to confirm this entry.",
    proposals: [],
  });
  await send("Yes");
  expect(button("Yes, save")).toBeDefined();
  expect(request.mock.calls.every((call) => call[1].action === "ai")).toBe(
    true,
  );
});
