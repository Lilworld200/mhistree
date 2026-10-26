import { afterEach, expect, it, vi } from "vitest";
import { GeminiSpeechGateway } from "@/features/ai-chat/speech/gateway";
import { wavFromSamples } from "@/features/ai-chat/speech/recording";
const wav = new Uint8Array(
  wavFromSamples([new Float32Array(1600).fill(0.1)], 16000),
);
const done = (content: object[]) =>
  Response.json({
    status: "completed",
    steps: [{ type: "model_output", content }],
  });
afterEach(() => vi.unstubAllGlobals());
it("sends inline WAV with verbatim transcription and opts out of provider interaction storage", async () => {
  const fetcher = vi.fn(async () =>
    done([{ type: "text", text: "Um, five, no, ten milligrams." }]),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await new GeminiSpeechGateway("synthetic").transcribe(wav)).toBe(
    "Um, five, no, ten milligrams.",
  );
  const body = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  );
  expect(body.store).toBe(false);
  expect(body.model).toBe("gemini-3.5-transcribe");
  expect(body.input[0].data).toBe(Buffer.from(wav).toString("base64"));
  expect(body.generation_config.transcription_config.mode).toEqual({
    type: "verbatim",
  });
});
it("keeps delivery instructions separate and returns WAV without changing the reply text", async () => {
  const fetcher = vi.fn(async () =>
    done([
      {
        type: "audio",
        mime_type: "audio/wav",
        data: Buffer.from(wav).toString("base64"),
      },
    ]),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new GeminiSpeechGateway("synthetic").synthesize(
      "Take a break? Don't change your prescribed dose.",
    ),
  ).toEqual(wav);
  const body = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  );
  expect(body.input[0].content[0].text).toBe(
    "Take a break? Don't change your prescribed dose.",
  );
  expect(body.generation_config.speech_config).toEqual([{ voice: "Sulafat" }]);
});
it("does not retry quota failures, incomplete output or invalid audio", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 429 }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new GeminiSpeechGateway("synthetic").transcribe(wav),
  ).rejects.toThrow("RATE_LIMITED");
  expect(fetcher).toHaveBeenCalledTimes(1);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "failed", steps: [] })),
  );
  await expect(
    new GeminiSpeechGateway("synthetic").synthesize("Hello"),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      done([{ type: "audio", mime_type: "audio/wav", data: "AAAA" }]),
    ),
  );
  await expect(
    new GeminiSpeechGateway("synthetic").synthesize("Hello"),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
});
