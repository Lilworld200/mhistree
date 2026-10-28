// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatView } from "@/features/ai-chat/chat-view";
const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (e: Error) => e.message,
}));
vi.mock("@/features/ai-chat/extraction/status-view", () => ({
  ExtractionStatus: () => null,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.resetAllMocks();
});
it("attributes practitioner replies, requires recipient selection and sends direct text without AI generation or extraction", async () => {
  const recipient = {
    connectionId: "connection",
    practitionerId: "doctor",
    revision: 1,
    name: "Dr Synthetic",
    kind: "direct",
  };
  const care = {
    recipients: [recipient],
    online: ["connection:doctor"],
    items: [
      {
        id: "care-reply",
        role: "practitioner",
        name: "Dr Synthetic",
        content: "A synthetic practitioner response.",
        sent_at: new Date().toISOString(),
        sequence: "2",
        connection_id: "connection",
        origin_conversation_id: "conversation",
      },
    ],
  };
  let deny = false;
  apiMock.mockImplementation(
    async (path: string, input?: { action: string }) => {
      if (path === "/api/chat/connected-care") {
        if (input?.action === "send" && deny) throw new Error("ACCESS_REVOKED");
        return care;
      }
      if (path === "/api/chat")
        return [{ id: "conversation", created_at: new Date().toISOString() }];
      if (path.startsWith("/api/chat?id="))
        return { items: [], nextCursor: null };
      if (path === "/api/chat/speech") return { enabled: false };
      if (input?.action === "generate")
        throw new Error("Direct mode must not generate");
      return {};
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(ChatView)));
  expect(host.textContent).toContain("A synthetic practitioner response.");
  const select = host.querySelector("select")!;
  expect(select.value).toBe("");
  await act(async () => {
    select.value = "connection:doctor";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.textContent).toContain("Mhistree will not reply");
  await act(async () => {
    const field = host.querySelector("#chat-message")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "My deliberate direct response.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(
    apiMock.mock.calls.some(
      ([path, input]) =>
        path === "/api/chat/connected-care" && input?.action === "send",
    ),
  ).toBe(true);
  expect(
    apiMock.mock.calls.some(
      ([path, input]) =>
        path === "/api/extraction" || input?.action === "generate",
    ),
  ).toBe(false);
  await act(async () => {
    [...host.querySelectorAll("button")]
      .find((b) => b.textContent === "Return to Mhistree")!
      .click();
  });
  expect(select.value).toBe("");
  deny = true;
  await act(async () => {
    select.value = "connection:doctor";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const field = host.querySelector("#chat-message")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(field, "Keep this unsent draft.");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(select.value).toBe("");
  expect(host.textContent).not.toContain("A synthetic practitioner response.");
  expect(host.querySelector<HTMLTextAreaElement>("#chat-message")!.value).toBe(
    "Keep this unsent draft.",
  );
});
