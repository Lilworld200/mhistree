// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatView } from "@/features/ai-chat/chat-view";
import type { CareProposal } from "@/features/ai-chat/care-action-schema";
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
  await act(async () => root?.unmount());
  host?.remove();
  vi.resetAllMocks();
});
it("shows an old pending draft once below the newest reply, preserves edits and requires explicit Send", async () => {
  const connectionId = "10000000-0000-4000-8000-000000000001",
    practitionerId = "10000000-0000-4000-8000-000000000002";
  let proposal: CareProposal = {
    id: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    kind: "message",
    state: "draft",
    version: 2,
    result_id: null,
    payload: {
      content: "My saved edited question.",
      summary: null,
      connectionId,
      practitionerId,
      connectionRevision: 1,
      slot: null,
    },
  };
  const history = () => ({
    items: [
      {
        id: "old-reply",
        role: "assistant",
        content: "Earlier reply.",
        captured_at: new Date().toISOString(),
        timezone: "UTC",
        sequence: "1",
        state: null,
        careProposal: proposal,
      },
      {
        id: "new-reply",
        role: "assistant",
        content: "Your saved draft is shown below.",
        captured_at: new Date().toISOString(),
        timezone: "UTC",
        sequence: "3",
        state: null,
      },
    ],
    nextCursor: null,
    pendingCareProposal: { ...proposal, replyMessageId: "old-reply" },
  });
  apiMock.mockImplementation(
    async (path: string, input?: { action?: string }) => {
      if (path === "/api/chat/connected-care")
        return { items: [], recipients: [], online: [] };
      if (path === "/api/chat/speech") return { enabled: false };
      if (path === "/api/chat")
        return [
          { id: proposal.conversationId, created_at: new Date().toISOString() },
        ];
      if (path.startsWith("/api/chat?id=")) return history();
      if (path === "/api/chat/care-actions" && input?.action === "confirm")
        return (proposal = {
          ...proposal,
          state: "completed",
          version: 3,
          result_id: "stored-copy",
          deliveries: [
            {
              connectionId,
              state: "stored",
              resultId: "stored-copy",
              errorCode: null,
            },
          ],
        });
      if (path.startsWith("/api/chat/care-actions"))
        return {
          proposal,
          options: {
            status: "available",
            bounded: false,
            recipients: [
              {
                connectionId,
                practitionerId,
                revision: 1,
                name: "Dr Synthetic",
                kind: "direct",
              },
            ],
            slots: [],
          },
        };
      return {};
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(ChatView)));
  expect(
    host.querySelectorAll('[aria-label="Review care message"]'),
  ).toHaveLength(1);
  const draft = host.querySelector<HTMLTextAreaElement>(
    '[aria-label="Care message draft"]',
  )!;
  expect(draft.value).toBe("My saved edited question.");
  expect(
    apiMock.mock.calls.some(([, input]) => input?.action === "confirm"),
  ).toBe(false);
  await act(async () =>
    host
      .querySelector('[aria-label="Review care message"] form')!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(
    apiMock.mock.calls.filter(([, input]) => input?.action === "confirm"),
  ).toHaveLength(1);
  expect(host.textContent).toContain("Message saved to Care inbox");
});
