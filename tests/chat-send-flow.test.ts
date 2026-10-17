// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatView } from "@/features/ai-chat/chat-view";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (error: Error) => error.message,
}));
vi.mock("@/features/ai-chat/extraction/status-view", () => ({
  ExtractionStatus: () => null,
}));

let root: Root;
let host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.resetAllMocks();
});
async function mount(state: string) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  apiMock.mockImplementation(async (path: string) => {
    if (path === "/api/chat")
      return [{ id: "conversation", created_at: new Date().toISOString() }];
    return {
      items: [
        {
          id: "message",
          role: "patient",
          content: "Hello",
          captured_at: new Date().toISOString(),
          timezone: "UTC",
          state,
          sequence: "1",
        },
      ],
      nextCursor: null,
    };
  });
  await act(async () => root.render(createElement(ChatView)));
}
describe("patient reply controls and first send", () => {
  it.each(["queued", "running", "succeeded", "cancelled"])(
    "does not offer retry for %s",
    async (state) => {
      await mount(state);
      expect(host.textContent).not.toContain("Retry reply");
    },
  );
  it("offers retry for a failed reply", async () => {
    await mount("failed");
    expect(host.textContent).toContain("Retry reply");
  });
  it("starts first generation even when the post-send history refresh fails", async () => {
    await mount("succeeded");
    apiMock.mockImplementation(
      async (path: string, data?: { action?: string }) => {
        if (data?.action === "send") return { messageId: "new-message" };
        if (data?.action === "generate") return { state: "succeeded" };
        if (path === "/api/extraction") return [];
        throw new Error("PROVIDER_UNAVAILABLE");
      },
    );
    await act(async () => {
      const input = host.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, "Synthetic hello");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host
        .querySelector("form.composer")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(apiMock).toHaveBeenCalledWith("/api/chat", {
      action: "generate",
      data: { id: "new-message" },
    });
    expect(
      apiMock.mock.calls.filter(([, d]) => d?.action === "send"),
    ).toHaveLength(1);
    expect(apiMock).toHaveBeenCalledWith("/api/extraction", {
      messageId: "new-message",
    });
  });
  it.each(["partial", "held"])(
    "shows %s extraction even when the reply succeeds",
    async (state) => {
      await mount("succeeded");
      apiMock.mockImplementation(
        async (path: string, data?: { action?: string }) => {
          if (data?.action === "send") return { messageId: "new-message" };
          if (data?.action === "generate") return { state: "succeeded" };
          if (path === "/api/extraction") return { state };
          return { items: [], nextCursor: null };
        },
      );
      await act(async () => {
        const input = host.querySelector("textarea")!;
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )!.set!.call(input, "Synthetic report");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        host
          .querySelector("form.composer")!
          .dispatchEvent(
            new Event("submit", { bubbles: true, cancelable: true }),
          );
      });
      expect(apiMock).toHaveBeenCalledWith("/api/chat", {
        action: "generate",
        data: { id: "new-message" },
      });
      expect(host.textContent).toContain(
        state === "partial"
          ? "timeline processing is incomplete"
          : "need clarification or review",
      );
    },
  );
});
