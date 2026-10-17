import { afterEach, expect, it, vi } from "vitest";
import {
  aiDebug,
  aiDebugError,
  debugMessage,
  debugRef,
  withAIDebug,
} from "@/lib/ai/debug";
import { GeminiGateway } from "@/lib/ai/gateway";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const configured = () =>
  new GeminiGateway({
    key: "synthetic-api-secret",
    chatModel: "patient-model",
    extractionModel: "extract-model",
  });
const lines = (log: {
  mock: { calls: unknown[][] };
}): Record<string, string | number | boolean | undefined>[] =>
  log.mock.calls.map((c) => JSON.parse(String(c[1])));

it("is switchable and defaults off in production", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AI_DEBUG", "");
  aiDebug("test.stage");
  expect(log).not.toHaveBeenCalled();
  vi.stubEnv("AI_DEBUG", "1");
  aiDebug("test.stage");
  expect(log).toHaveBeenCalledTimes(1);
  vi.stubEnv("AI_DEBUG", "0");
  aiDebug("test.stage");
  expect(log).toHaveBeenCalledTimes(1);
});

it("keeps async traces isolated and filters payloads, secrets, raw errors and private reasoning", async () => {
  vi.stubEnv("AI_DEBUG", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  await Promise.all(
    ["a", "b"].map((id) =>
      withAIDebug(
        { operation: "extraction", jobRef: debugRef(id) },
        async () => {
          debugMessage(`message-${id}`);
          await Promise.resolve();
          aiDebug("extraction.test", {
            itemCount: 2,
            source: "private-patient",
            prompt: "private-prompt",
            reasoning: "private-reasoning",
            key: "private-key",
            headers: { cookie: "private-cookie" },
          });
          aiDebugError("extraction.failed", {
            code: "23505",
            message: "private-patient",
            detail: "private-detail",
            table: "contributions",
            constraint: "synthetic_unique",
          });
        },
      ),
    ),
  );
  const events = lines(log).filter((e) => e.event === "extraction.test");
  expect(events).toHaveLength(2);
  expect(new Set(events.map((e) => e.traceId)).size).toBe(2);
  expect(events.map((e) => e.messageRef).sort()).toEqual(
    [debugRef("message-a"), debugRef("message-b")].sort(),
  );
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /private-patient|private-prompt|private-reasoning|private-key|private-cookie|private-detail/,
  );
  expect(
    lines(log)
      .filter((e) => e.event === "extraction.failed")
      .every((e) => e.code === "23505"),
  ).toBe(true);
});

it("logs usage metadata from one existing request and discards thought text", async () => {
  vi.stubEnv("AI_DEBUG", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 12,
        totalTokenCount: 117,
        thoughtsTokenCount: 5,
      },
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: "private-reasoning", thought: true },
              { text: "Synthetic reply" },
            ],
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  expect(
    await configured().generate("private-prompt", [
      { role: "user", content: "private-patient" },
    ]),
  ).toBe("Synthetic reply");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(lines(log).find((e) => e.event === "provider.response")).toMatchObject(
    {
      promptTokenCount: 100,
      thoughtsTokenCount: 5,
      totalTokenCount: 117,
      finishReason: "STOP",
    },
  );
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /private-reasoning|private-prompt|private-patient|synthetic-api-secret|Synthetic reply/,
  );
});

it("distinguishes output-token exhaustion from an HTTP quota failure without logging upstream details", async () => {
  vi.stubEnv("AI_DEBUG", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: "private-output" }] },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(
      Response.json(
        {
          error: {
            status: "RESOURCE_EXHAUSTED",
            message: "private-provider-error",
            details: [
              {
                "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                violations: [{ description: "private-quota-detail" }],
              },
            ],
          },
        },
        { status: 429, headers: { "retry-after": "60" } },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    configured().generate("test", [{ role: "user", content: "test" }]),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  await expect(
    configured().generate("test", [{ role: "user", content: "test" }]),
  ).rejects.toThrow("RATE_LIMITED");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(lines(log).find((e) => e.finishReason === "MAX_TOKENS")).toBeDefined();
  expect(
    lines(log).find((e) => e.event === "provider.http.failed"),
  ).toMatchObject({
    upstreamStatus: 429,
    providerStatus: "RESOURCE_EXHAUSTED",
    quotaFailure: true,
  });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(
    /private-output|private-provider-error|private-quota-detail/,
  );
});

it("a broken console cannot fail the clinical operation", async () => {
  vi.stubEnv("AI_DEBUG", "1");
  vi.spyOn(console, "info").mockImplementation(() => {
    throw new Error("console unavailable");
  });
  expect(await withAIDebug({ operation: "test" }, async () => 7)).toBe(7);
});
