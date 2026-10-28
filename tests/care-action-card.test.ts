// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CareActionCard } from "@/features/ai-chat/care-action-card";
import type { CareProposal } from "@/features/ai-chat/care-action-schema";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (e: Error) => e.message,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.resetAllMocks();
});
function sample(kind: "message" | "appointment" = "message"): CareProposal {
  return {
    id: crypto.randomUUID(),
    kind,
    version: 1,
    state: "draft",
    result_id: null,
    payload: {
      content: "Would this medicine help?",
      connectionId: "connection",
      practitionerId: "doctor",
      connectionRevision: 1,
      slot: null,
    },
  };
}
async function mount(p: CareProposal) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(CareActionCard, { proposal: p })),
  );
}
function options(p: CareProposal) {
  return {
    proposal: p,
    options: {
      status: "available",
      bounded: false,
      recipients: [
        {
          connectionId: "connection",
          practitionerId: "doctor",
          revision: 1,
          name: "Dr Synthetic",
          kind: "direct",
        },
      ],
      slots: [],
    },
  };
}
it("only confirms after an explicit Send and shows stored rather than read", async () => {
  const p = sample();
  apiMock.mockImplementation(
    async (_path: string, input?: { action: string }) =>
      input?.action === "confirm"
        ? { ...p, version: 2, state: "completed", result_id: "saved" }
        : options(p),
  );
  await mount(p);
  expect(apiMock.mock.calls.every(([, input]) => !input)).toBe(true);
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(
    apiMock.mock.calls.filter(([, input]) => input?.action === "confirm"),
  ).toHaveLength(1);
  expect(host.textContent).toContain("Message saved to Care inbox");
  expect(host.textContent).toContain("does not mean it has been read");
});
it("keeps a draft visible when eligibility lookup fails and offers retry without sending", async () => {
  const p = sample();
  apiMock.mockRejectedValue(new Error("Lookup unavailable"));
  await mount(p);
  expect((host.querySelector("textarea") as HTMLTextAreaElement).value).toBe(
    p.payload.content,
  );
  expect(host.textContent).toContain("Lookup unavailable");
  expect(
    (host.querySelector('[type="submit"]') as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(apiMock.mock.calls.every(([, input]) => !input)).toBe(true);
});
it("does not enable appointment confirmation without an advertised time", async () => {
  const p = sample("appointment");
  apiMock.mockResolvedValue(options(p));
  await mount(p);
  expect(host.textContent).toContain("No available times");
  expect(
    (host.querySelector('[type="submit"]') as HTMLButtonElement).disabled,
  ).toBe(true);
});
it("labels an organization destination as shared", async () => {
  const p = sample();
  const o = options(p);
  o.options.recipients[0].kind = "organization";
  apiMock.mockResolvedValue(o);
  await mount(p);
  expect(host.textContent).toContain("not a private practitioner inbox");
});

it("waits for the reviewed edit to save before confirming its returned version", async () => {
  const p = sample();
  let written = p;
  apiMock.mockImplementation(
    async (
      _path: string,
      input?: {
        action: string;
        payload?: CareProposal["payload"];
        version: number;
      },
    ) => {
      if (input?.action === "update") {
        written = { ...p, version: 2, payload: input.payload! };
        return written;
      }
      if (input?.action === "confirm") {
        expect(input.version).toBe(2);
        return {
          ...written,
          state: "completed",
          version: 3,
          result_id: "result",
        };
      }
      return options(p);
    },
  );
  await mount(p);
  await act(async () => {
    const field = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "The exact text I reviewed.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const mutations = apiMock.mock.calls.filter(([, input]) => input);
  expect(mutations.map(([, input]) => input.action)).toEqual([
    "update",
    "confirm",
  ]);
  expect(mutations[0][1].payload.content).toBe("The exact text I reviewed.");
});

it("clears the displayed typed-confirmation binding immediately when the draft is edited", async () => {
  const p = sample(),
    binding = vi.fn();
  const confirmation = {
    id: crypto.randomUUID(),
    question: "Send this message to Dr Synthetic?",
    version: 1,
  };
  apiMock.mockImplementation(
    async (_path: string, input?: { action: string }) =>
      input?.action === "arm" ? { ...p, confirmation } : options(p),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(CareActionCard, {
        proposal: p,
        onConfirmationChange: binding,
      }),
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 350));
  });
  expect(binding).toHaveBeenLastCalledWith(confirmation.id);
  await act(async () => {
    const field = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "A newly reviewed question.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(binding).toHaveBeenLastCalledWith(null);
  expect(
    apiMock.mock.calls.filter(([, input]) => input?.action === "confirm"),
  ).toHaveLength(0);
});

it("updates the card from a typed Send receipt loaded in conversation history", async () => {
  const p = sample();
  apiMock.mockResolvedValue(options(p));
  await mount(p);
  await act(async () =>
    root.render(
      createElement(CareActionCard, {
        proposal: { ...p, version: 2, state: "completed", result_id: "saved" },
      }),
    ),
  );
  expect(host.textContent).toContain("Message saved to Care inbox");
  expect(host.querySelector("textarea")).toBeNull();
});
