import { afterEach, expect, it, vi } from "vitest";
import { GeminiGateway } from "@/lib/ai/gateway";

const response = () =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: "Synthetic reply" }] },
      },
    ],
  });
const gateway = new GeminiGateway({
  key: "synthetic-secret",
  chatModel: "patient-model",
  extractionModel: "extract-model",
  clinicianModel: "clinician-model",
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("recovers from a transient503 without changing model or leaking payloads", async () => {
  const log = vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(response());
  vi.stubGlobal("fetch", fetch);
  expect(
    await gateway.generate("private-system", [
      { role: "user", content: "private-message" },
    ]),
  ).toBe("Synthetic reply");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[0][0]).toBe(fetch.mock.calls[1][0]);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /synthetic-secret|private-system|private-message/,
  );
});
it("stops after three transient failures", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(Response.json({}, { status: 503 })),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    gateway.generate("test", [{ role: "user", content: "test" }]),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(fetch).toHaveBeenCalledTimes(3);
});
it("does not retry permanent errors or long quota waits", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { status: 403 }))
    .mockResolvedValueOnce(
      Response.json({}, { status: 429, headers: { "retry-after": "60" } }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    gateway.generate("test", [{ role: "user", content: "test" }]),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(fetch).toHaveBeenCalledTimes(1);
  await expect(
    gateway.generate("test", [{ role: "user", content: "test" }]),
  ).rejects.toThrow("RATE_LIMITED");
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("does not contact the provider when already cancelled", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    gateway.generate("test", [{ role: "user", content: "test" }], {
      signal: AbortSignal.abort(),
    }),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(fetch).not.toHaveBeenCalled();
});
it("routes clinician and extraction requests to their configured models", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(response()));
  vi.stubGlobal("fetch", fetch);
  await gateway.generate("test", [{ role: "user", content: "test" }], {
    purpose: "clinician",
  });
  await gateway.generate("test", [{ role: "user", content: "test" }], {
    purpose: "extraction",
    json: true,
  });
  expect(fetch.mock.calls[0][0]).toContain("clinician-model:generateContent");
  expect(fetch.mock.calls[1][0]).toContain("extract-model:generateContent");
});
