import { afterEach, expect, it, vi } from "vitest";
import { CompatibleGateway } from "@/lib/ai/compatible";
import { aiGateway } from "@/lib/ai/gateway";
import { GroqGateway } from "@/lib/ai/groq";
import { speechConfiguration } from "@/features/ai-chat/speech/config";
const value = {
  text: "Ada Synthetic; your birth date is unavailable.",
  dialogue: {
    topic: "everyday",
    decision: "general_information",
    question: { kind: "none", subject: "" },
  },
  sourceQuotes: [],
  action: null,
};
const response = (content = JSON.stringify(value), extra: object = {}) =>
  Response.json({
    choices: [
      {
        finish_reason: "stop",
        message: { content, reasoning_content: "private-reasoning" },
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    ...extra,
  });
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("allows a slower practitioner draft within its deadline while ordinary replies still time out without retries", async () => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
  const fetcher = vi.fn(
    (_url: unknown, request: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(response('{"text":"review"}')),
          60000,
        );
        request.signal!.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("deadline"));
        });
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const gateway = new CompatibleGateway(
    "synthetic-key",
    "nvidia",
    "nvidia/test",
  );
  const ordinary = expect(
    gateway.generate("policy", [], { json: true }),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  const practitioner = expect(
    gateway.generate("policy", [], { json: true, purpose: "clinician" }),
  ).resolves.toBe('{"text":"review"}');
  await vi.advanceTimersByTimeAsync(60000);
  await ordinary;
  await practitioner;
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("selects each explicit provider and permits Groq rollback while keeping speech independent", () => {
  for (const provider of ["nvidia", "openrouter"]) {
    vi.stubEnv("AI_PROVIDER", provider);
    vi.stubEnv(
      provider === "nvidia" ? "NVIDIA_API_KEY" : "OPENROUTER_API_KEY",
      "synthetic-key",
    );
    vi.stubEnv(
      provider === "nvidia" ? "AI_NVIDIA_MODEL" : "AI_OPENROUTER_MODEL",
      provider === "nvidia" ? "nvidia/test" : "nvidia/test:free",
    );
    expect(aiGateway()).toBeInstanceOf(CompatibleGateway);
    vi.stubEnv("GROQ_API_KEY", "voice-key");
    vi.stubEnv("AUTH_FLOW_COOKIE_KEY", "a".repeat(64));
    expect(speechConfiguration().provider).toBe("groq");
  }
  vi.stubEnv("AI_PROVIDER", "groq");
  expect(aiGateway()).toBeInstanceOf(GroqGateway);
  vi.stubEnv("AI_PROVIDER", "unselected");
  expect(() => aiGateway()).toThrow("CONFIGURATION_REQUIRED");
});
it("sends a single fixed model and validates the unchanged patient schema without exposing reasoning", async () => {
  const fetcher = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetcher);
  const gateway = new CompatibleGateway(
    "secret",
    "openrouter",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
  );
  expect(
    await gateway.patientReply("policy", [
      { role: "user", content: "my name?" },
    ]),
  ).toEqual(value);
  const [url, request] = fetcher.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  const body = JSON.parse(request.body as string);
  expect(body.provider.allow_fallbacks).toBe(false);
  expect(body.reasoning).toEqual({ enabled: false, exclude: true });
  expect(body.max_tokens).toBe(2048);
  expect(body.messages[0].content).toContain("Required JSON Schema");
  expect(body.response_format).toBeUndefined();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("uses NVIDIA JSON mode, disabled thinking and bounded output", async () => {
  const fetcher = vi.fn(async () => response('{"ok":true}'));
  vi.stubGlobal("fetch", fetcher);
  const gateway = new CompatibleGateway(
    "secret",
    "nvidia",
    "nvidia/nemotron-3.5-lightning-30b-a3b",
  );
  await gateway.generate("policy", [], { json: true, maxOutputTokens: 999999 });
  const body = JSON.parse(
    (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as string,
  );
  expect(body.max_tokens).toBe(4096);
  expect(body.chat_template_kwargs.enable_thinking).toBe(false);
  expect(body.response_format).toEqual({ type: "json_object" });
});
it("does not retry errors, incomplete output, invalid schema or inline private reasoning", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(
      response("{}", {
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }),
    )
    .mockResolvedValueOnce(response("{}"))
    .mockResolvedValueOnce(response("<think>private</think>{}"))
    .mockResolvedValueOnce(
      response("{}", { error: { message: "private-provider-text" } }),
    );
  vi.stubGlobal("fetch", fetcher);
  const gateway = new CompatibleGateway(
    "secret",
    "openrouter",
    "test/model:free",
  );
  await expect(gateway.patientReply("policy", [])).rejects.toThrow(
    "RATE_LIMITED",
  );
  for (let i = 0; i < 4; i++)
    await expect(gateway.patientReply("policy", [])).rejects.toThrow(
      "PROVIDER_UNAVAILABLE",
    );
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it("fails closed for missing configuration, paid router IDs and cancellation", async () => {
  expect(() => new CompatibleGateway("", "nvidia", "model")).toThrow(
    "CONFIGURATION_REQUIRED",
  );
  expect(
    () => new CompatibleGateway("secret", "openrouter", "paid/model"),
  ).toThrow("CONFIGURATION_REQUIRED");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const cancel = new AbortController();
  cancel.abort();
  await expect(
    new CompatibleGateway("secret", "nvidia", "model").generate("policy", [], {
      signal: cancel.signal,
    }),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(fetcher).not.toHaveBeenCalled();
});

it("bounds streamed provider payloads before parsing and cancels oversized responses", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(256 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  const fetcher = vi.fn(async () => new Response(stream));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new CompatibleGateway("secret", "nvidia", "nvidia/test").generate(
      "policy",
      [],
      { json: true },
    ),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(cancelled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
