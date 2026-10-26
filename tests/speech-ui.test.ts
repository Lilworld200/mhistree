// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ChatView } from "@/features/ai-chat/chat-view";
const { apiMock, startMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  startMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/client-api", () => ({
  api: apiMock,
  errorMessage: (e: Error) => e.message,
}));
vi.mock("@/features/ai-chat/extraction/status-view", () => ({
  ExtractionStatus: () => null,
}));
vi.mock("@/features/ai-chat/speech/recording", () => ({
  startMicrophone: startMock,
  audioBase64: () => "synthetic",
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root, host: HTMLDivElement, done: (wav: ArrayBuffer | null) => void;
let items: object[],
  fetcher: ReturnType<typeof vi.fn>,
  play: ReturnType<typeof vi.fn>,
  pause: ReturnType<typeof vi.fn>,
  cancel: ReturnType<typeof vi.fn>;
function button(name: string) {
  const el = [...host.querySelectorAll("button")].find(
    (b) => b.getAttribute("aria-label") === name || b.textContent === name,
  );
  if (!el) throw new Error(`Missing button ${name}`);
  return el;
}
async function click(name: string) {
  await act(async () => button(name).click());
}
async function input(value: string) {
  await act(async () => {
    const el = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  items = [];
  apiMock.mockImplementation(
    async (path: string, data?: { action?: string }) => {
      if (path === "/api/chat" && !data)
        return [{ id: "conversation", created_at: new Date().toISOString() }];
      if (data?.action === "send") {
        items = [
          {
            id: "patient",
            role: "patient",
            content: "reviewed",
            inputMethod: "microphone",
            captured_at: new Date().toISOString(),
            timezone: "UTC",
          },
        ];
        return { messageId: "patient" };
      }
      if (data?.action === "generate") {
        items.push({
          id: "reply",
          reply_to: "patient",
          role: "assistant",
          content: "Synthetic reply",
          captured_at: new Date().toISOString(),
          timezone: "UTC",
        });
        return { state: "succeeded" };
      }
      if (path === "/api/extraction") return { state: "succeeded" };
      return { items, nextCursor: null };
    },
  );
  fetcher = vi.fn(async (_path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null;
    if (body?.action === "transcribe")
      return Response.json({
        ok: true,
        data: { text: "Machine transcript", token: "receipt" },
      });
    if (body?.action === "synthesize")
      return new Response(new Uint8Array([1]), {
        headers: { "Content-Type": "audio/wav" },
      });
    return Response.json({ ok: true, data: { enabled: true } });
  });
  vi.stubGlobal("fetch", fetcher);
  play = vi.fn(async () => {});
  pause = vi.fn();
  vi.stubGlobal(
    "Audio",
    class {
      play = play;
      pause = pause;
      onended = null;
      onerror = null;
    },
  );
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:synthetic"),
      revokeObjectURL: vi.fn(),
    }),
  );
  cancel = vi.fn();
  startMock.mockImplementation(async (onDone) => {
    done = onDone;
    return { cancel, stop: vi.fn(() => done(new ArrayBuffer(4))) };
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(ChatView)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("reviews and edits the transcript before sending, then speaks the saved reply and reuses replay audio", async () => {
  await click("Record a voice message");
  expect(host.textContent).toContain("Listening");
  await click("Stop recording");
  expect(host.querySelector("textarea")!.value).toBe("Machine transcript");
  expect(apiMock.mock.calls.some(([, data]) => data?.action === "send")).toBe(
    false,
  );
  await input("Reviewed medication spelling");
  await act(async () =>
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(apiMock).toHaveBeenCalledWith("/api/chat", {
    action: "send",
    data: expect.objectContaining({
      content: "Reviewed medication spelling",
      inputMethod: "microphone",
      transcriptionToken: "receipt",
    }),
  });
  expect(play).toHaveBeenCalledTimes(1);
  await click("Stop playback");
  await act(async () => button("Play reply").click());
  const requests = fetcher.mock.calls.filter(
    ([, init]) =>
      init?.body && JSON.parse(init.body as string).action === "synthesize",
  );
  expect(requests).toHaveLength(1);
  expect(play).toHaveBeenCalledTimes(2);
});
it("cancels recording and ignores a late transcription result", async () => {
  await input("Keep this draft");
  await click("Record a voice message");
  await click("Cancel recording");
  await act(async () => done(new ArrayBuffer(4)));
  expect(cancel).toHaveBeenCalled();
  expect(host.querySelector("textarea")!.value).toBe("Keep this draft");
  expect(fetcher.mock.calls.some(([, init]) => init?.body)).toBe(false);
});
it("keeps typed messages silent", async () => {
  await input("Typed message");
  await act(async () =>
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(apiMock).toHaveBeenCalledWith("/api/chat", {
    action: "send",
    data: expect.not.objectContaining({ inputMethod: "microphone" }),
  });
  expect(play).not.toHaveBeenCalled();
});
it("offers Play after autoplay denial and retains written replies when TTS fails", async () => {
  play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
  await click("Record a voice message");
  await click("Stop recording");
  await act(async () =>
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.textContent).toContain("Tap Play reply");
  expect(host.textContent).toContain("Synthetic reply");
  await act(async () => button("Play reply").click());
  expect(play).toHaveBeenCalledTimes(2);
});

it("leaves a written reply usable when TTS is quota-limited", async () => {
  await click("Record a voice message");
  await click("Stop recording");
  fetcher.mockImplementationOnce(async () =>
    Response.json(
      { ok: false, error: { code: "RATE_LIMITED" } },
      { status: 429 },
    ),
  );
  await act(async () =>
    host
      .querySelector("form.composer")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.textContent).toContain("Synthetic reply");
  expect(host.textContent).toContain("temporarily limited");
  expect(play).not.toHaveBeenCalled();
});
it("preserves the composer on microphone denial and cleans up active capture on unmount", async () => {
  await input("Keep this text");
  startMock.mockRejectedValueOnce(
    new DOMException("Denied", "NotAllowedError"),
  );
  await click("Record a voice message");
  expect(host.textContent).toContain("Microphone access wasn't allowed");
  expect(host.querySelector("textarea")!.value).toBe("Keep this text");
  await click("Record a voice message");
  const signal = startMock.mock.calls.at(-1)![2] as AbortSignal;
  await act(async () => root.unmount());
  expect(signal.aborted).toBe(true);
  expect(cancel).toHaveBeenCalled();
  root = createRoot(host);
});
it("never autoplays existing microphone history after a remount", async () => {
  items = [
    {
      id: "patient",
      role: "patient",
      content: "Earlier voice report",
      inputMethod: "microphone",
      captured_at: new Date().toISOString(),
      timezone: "UTC",
    },
    {
      id: "reply",
      role: "assistant",
      reply_to: "patient",
      replyInputMethod: "microphone",
      content: "Earlier reply",
      captured_at: new Date().toISOString(),
      timezone: "UTC",
    },
  ];
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(createElement(ChatView)));
  expect(host.textContent).toContain("Earlier reply");
  expect(play).not.toHaveBeenCalled();
  expect(
    fetcher.mock.calls.some(
      ([, init]) =>
        init?.body && JSON.parse(init.body as string).action === "synthesize",
    ),
  ).toBe(false);
});
