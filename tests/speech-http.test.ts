import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/chat/speech/route";
const { status, transcribe, synthesize } = vi.hoisted(() => ({
  status: vi.fn(async () => ({ enabled: true })),
  transcribe: vi.fn(async () => ({ text: "Synthetic", token: "receipt" })),
  synthesize: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("@/lib/db/client", () => ({ database: () => ({}) }));
vi.mock("@/features/ai-chat/speech/server", () => ({
  speechStatus: status,
  speechPlaybackAccess: vi.fn(async () => "Synthetic reply"),
  transcribeRecording: transcribe,
  synthesizeReply: synthesize,
}));
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
function request(body: object, origin = "https://mhistree.example") {
  vi.stubEnv("APP_ORIGIN", "https://mhistree.example");
  return new NextRequest("https://mhistree.example/api/chat/speech", {
    method: "POST",
    headers: {
      origin,
      "Content-Type": "application/json",
      cookie: "mhistree-session=synthetic",
    },
    body: JSON.stringify(body),
  });
}
it("rejects foreign-origin requests and arbitrary TTS text without calling services", async () => {
  expect(
    (
      await POST(
        request(
          { action: "transcribe", base64: "AAAA" },
          "https://foreign.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(status).not.toHaveBeenCalled();
  expect(
    (
      await POST(
        request({
          action: "synthesize",
          messageId: "11111111-1111-4111-8111-111111111111",
          text: "Untrusted text",
        }),
      )
    ).status,
  ).toBe(422);
  expect(synthesize).not.toHaveBeenCalled();
});
it("authenticates before processing and sends private, uncached audio", async () => {
  const response = await POST(
    request({
      action: "synthesize",
      messageId: "11111111-1111-4111-8111-111111111111",
    }),
  );
  expect(status).toHaveBeenCalledWith({}, "synthetic");
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Type")).toBe("audio/wav");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  );
});
