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
it("keeps private AI chat free of practitioner messages and direct-recipient switching", async () => {
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
  apiMock.mockImplementation(
    async (path: string, input?: { action: string }) => {
      if (path === "/api/chat/connected-care") {
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
  expect(host.textContent).not.toContain("A synthetic practitioner response.");
  expect(
    host.querySelector('select[aria-label="Conversation recipient"]'),
  ).toBeNull();
  expect(host.textContent).not.toContain("Return to Mhistree");
  expect(
    apiMock.mock.calls.some(([path]) => path === "/api/chat/connected-care"),
  ).toBe(false);
});
