// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ChatNavigationProvider,
  useChatNavigation,
} from "@/components/layout/chat-navigation";
import { ChatView } from "@/features/ai-chat/chat-view";
const { apiMock, reset } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  reset: vi.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (e: Error) => e.message,
}));
vi.mock("@/features/ai-chat/extraction/status-view", () => ({
  ExtractionStatus: () => null,
}));
vi.mock("@/features/ai-chat/speech/use-voice-chat", () => ({
  useVoiceChat: () => ({
    enabled: true,
    recording: "idle",
    playback: "idle",
    reset,
    stopPlayback: vi.fn(),
  }),
}));
let root: Root, host: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.resetAllMocks();
});
function Controls() {
  const chat = useChatNavigation();
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { onClick: () => chat?.select("older-conversation") },
      "Open older chat",
    ),
    createElement(
      "button",
      { onClick: () => chat?.select("") },
      "Start new chat",
    ),
  );
}
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        ChatNavigationProvider,
        null,
        createElement(Controls),
        createElement(ChatView),
      ),
    ),
  );
}
async function click(label: string) {
  await act(async () => {
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === label)!
      .click();
  });
}
async function type(text: string) {
  await act(async () => {
    const input = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
function responses(prepare: () => Promise<{ state: string }>) {
  apiMock.mockImplementation(
    async (path: string, data?: { action: string }) => {
      if (data?.action === "prepare-memory") return prepare();
      if (data?.action === "create") return {};
      if (data?.action === "send") return { messageId: "new-message" };
      if (data?.action === "generate") return { state: "succeeded" };
      if (path === "/api/extraction") return { state: "succeeded" };
      if (path === "/api/chat")
        return [
          {
            id: "old-conversation",
            created_at: new Date().toISOString(),
            title: "Coding day",
          },
        ];
      return { items: [], nextCursor: null, memoryReady: true };
    },
  );
}
describe("New chat memory preparation", () => {
  it("prepares immediately while typing and waits before sending", async () => {
    let release!: (v: { state: string }) => void;
    const pending = new Promise<{ state: string }>((r) => (release = r));
    responses(() => pending);
    await mount();
    await click("Start new chat");
    expect(
      apiMock.mock.calls.find(([, d]) => d?.action === "create")?.[1].data
        .previousConversationId,
    ).toBe("old-conversation");
    expect(host.textContent).toContain("You can keep typing");
    await type("How about tonight?");
    let sending!: Promise<void>;
    await act(async () => {
      sending = submit();
    });
    expect(apiMock.mock.calls.some(([, d]) => d?.action === "send")).toBe(
      false,
    );
    await act(async () => release({ state: "ready" }));
    await sending;
    expect(apiMock.mock.calls.some(([, d]) => d?.action === "send")).toBe(true);
    expect(apiMock.mock.calls.some(([, d]) => d?.action === "generate")).toBe(
      true,
    );
  });
  it("preserves a draft on preparation failure and explicitly continues with limited memory", async () => {
    responses(async () => {
      throw new Error("offline");
    });
    await mount();
    await click("Start new chat");
    await type("My draft survives");
    expect(host.textContent).toContain("could not finish preparing");
    expect(host.querySelector("textarea")!.value).toBe("My draft survives");
    await click("Continue without earlier memory");
    await submit();
    expect(apiMock).toHaveBeenCalledWith("/api/chat", {
      action: "generate",
      data: { id: "new-message", continueWithoutMemory: true },
    });
  });
  it("retries preparation before sending the retained draft", async () => {
    let attempts = 0;
    responses(async () => {
      if (!attempts++) throw new Error("offline");
      return { state: "ready" };
    });
    await mount();
    await click("Start new chat");
    await type("Still here");
    await click("Retry memory preparation");
    expect(host.querySelector("textarea")!.value).toBe("Still here");
    expect(host.textContent).not.toContain("could not finish preparing");
    await submit();
    expect(apiMock).toHaveBeenCalledWith("/api/chat", {
      action: "generate",
      data: { id: "new-message" },
    });
  });
  it("prepares the departing chat when selecting an older saved conversation", async () => {
    responses(async () => ({ state: "ready" }));
    await mount();
    await click("Open older chat");
    expect(apiMock).toHaveBeenCalledWith("/api/chat", {
      action: "depart",
      data: {
        id: "older-conversation",
        previousConversationId: "old-conversation",
      },
    });
    expect(apiMock).toHaveBeenCalledWith("/api/chat", {
      action: "prepare-memory",
      data: { id: "older-conversation" },
    });
    expect(apiMock.mock.calls.some(([, d]) => d?.action === "create")).toBe(
      false,
    );
  });
});
