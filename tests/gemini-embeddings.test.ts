import { afterEach, expect, it, vi } from "vitest";
import { embeddingGateway, GeminiEmbeddingGateway } from "@/lib/ai/embeddings";
const vector = () => Array.from({ length: 768 }, (_, i) => (i === 0 ? 2 : 0));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps embeddings on the configured Google model when chat is Groq and normalizes valid vectors", async () => {
  const fetcher = vi.fn(async () =>
    Response.json({ embedding: { values: vector() } }),
  );
  vi.stubGlobal("fetch", fetcher);
  const gateway = embeddingGateway({
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "unused",
    GEMINI_API_KEY: "synthetic",
    AI_EMBEDDING_MODEL: "gemini-embedding-2",
  });
  const result = await gateway.embed("Synthetic source text.");
  expect(result).toHaveLength(768);
  expect(result[0]).toBe(1);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent",
  );
  expect(JSON.parse(init.body as string)).toEqual({
    model: "models/gemini-embedding-2",
    content: { parts: [{ text: "Synthetic source text." }] },
    outputDimensionality: 768,
  });
  expect(init.cache).toBe("no-store");
  expect(init.redirect).toBe("error");
});

it.each([
  [429, "RATE_LIMITED"],
  [404, "CONFIGURATION_REQUIRED"],
  [403, "PROVIDER_UNAVAILABLE"],
  [503, "PROVIDER_UNAVAILABLE"],
])(
  "maps HTTP%s without retries or secret error details",
  async (status, code) => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { error: { message: "private echoed input" } },
        { status: status as number },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    await expect(
      new GeminiEmbeddingGateway("private-key").embed("private input"),
    ).rejects.toThrow(code as string);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private/);
  },
);

it("does not send cancelled, empty or overlong inputs, or accept the invalid 002 model name", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const gateway = new GeminiEmbeddingGateway("synthetic");
  await expect(gateway.embed(" ")).rejects.toThrow("VALIDATION_FAILED");
  await expect(gateway.embed("x".repeat(6001))).rejects.toThrow(
    "VALIDATION_FAILED",
  );
  await expect(gateway.embed("test", AbortSignal.abort())).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  expect(() =>
    embeddingGateway({
      GEMINI_API_KEY: "synthetic",
      AI_EMBEDDING_MODEL: "gemini-embedding-002",
    }),
  ).toThrow("CONFIGURATION_REQUIRED");
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(
  [[], [1, 2], Array(768).fill(0), Array(768).fill("invalid")].map(
    (values) => ({ values }),
  ),
)("rejects unusable provider vectors", async ({ values }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ embedding: { values } })),
  );
  await expect(
    new GeminiEmbeddingGateway("synthetic").embed("Synthetic"),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
});

it("rejects oversized bodies and network failures without replaying requests", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response("x".repeat(131073)))
    .mockRejectedValueOnce(new Error("private network detail"));
  vi.stubGlobal("fetch", fetcher);
  const gateway = new GeminiEmbeddingGateway("synthetic");
  await expect(gateway.embed("Synthetic")).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  await expect(gateway.embed("Synthetic")).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
