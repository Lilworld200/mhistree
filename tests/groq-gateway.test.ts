import { afterEach, expect, it, vi } from "vitest";
import { aiGateway } from "@/lib/ai/gateway";
import { GroqGateway, groqChatModel } from "@/lib/ai/groq";
import { GroqSpeechGateway } from "@/features/ai-chat/speech/groq-gateway";
import { speechConfiguration } from "@/features/ai-chat/speech/config";
import { wavFromSamples } from "@/features/ai-chat/speech/recording";
const wav = new Uint8Array(
  wavFromSamples([new Float32Array(1600).fill(0.1)], 16000),
);
const completion = (content = "Synthetic reply", finish_reason = "stop") =>
  Response.json({
    choices: [
      { finish_reason, message: { content, reasoning: "private-reasoning" } },
    ],
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("selects Groq for all generation purposes without requiring Gemini or honoring stale Gemini model names", async () => {
  vi.stubEnv("AI_PROVIDER", "groq");
  vi.stubEnv("GROQ_API_KEY", "synthetic-key");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("AI_PATIENT_MODEL", "gemini-old");
  const fetcher = vi.fn(async () => completion());
  vi.stubGlobal("fetch", fetcher);
  const gateway = aiGateway();
  for (const purpose of ["chat", "extraction", "clinician"] as const)
    expect(
      await gateway.generate(
        "private-system",
        [{ role: "user", content: "private-patient" }],
        { purpose },
      ),
    ).toBe("Synthetic reply");
  expect(gateway.modelName).toBe(groqChatModel);
  for (const [url, init] of fetcher.mock.calls as unknown as [
    string,
    RequestInit,
  ][]) {
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: groqChatModel,
      reasoning_effort: "low",
      include_reasoning: false,
      max_completion_tokens: 1536,
    });
    expect(body.tools).toBeUndefined();
    expect(init.redirect).toBe("error");
  }
  vi.stubEnv("AUTH_FLOW_COOKIE_KEY", "ab".repeat(32));
  expect(speechConfiguration()).toMatchObject({
    provider: "groq",
    key: "synthetic-key",
  });
});

it("requests JSON without publishing reasoning, partial output, malformed JSON or oversized responses", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(completion('{"items":[]}'))
    .mockResolvedValueOnce(completion("partial", "length"))
    .mockResolvedValueOnce(completion("<think>secret</think>answer"))
    .mockResolvedValueOnce(completion("invalid JSON"))
    .mockResolvedValueOnce(new Response("x".repeat(262145)));
  vi.stubGlobal("fetch", fetcher);
  const gateway = new GroqGateway("synthetic");
  expect(await gateway.generate("JSON items", [], { json: true })).toBe(
    '{"items":[]}',
  );
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    response_format: { type: "json_object" },
    max_completion_tokens: 4096,
  });
  for (const options of [{}, {}, { json: true }, {}])
    await expect(gateway.generate("private", [], options)).rejects.toThrow(
      "PROVIDER_UNAVAILABLE",
    );
});

it.each([429, 401, 403, 503])(
  "makes only one attempt on HTTP%s without leaking upstream details",
  async (status) => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const fetcher = vi.fn(async () =>
      Response.json({ error: { message: "secret-payload" } }, { status }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      new GroqGateway("secret-key").generate("private-system", []),
    ).rejects.toThrow(status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /secret-payload|secret-key|private-system/,
    );
  },
);

it("does not make cancelled calls or retry network errors", async () => {
  const fetcher = vi.fn(async () => {
    throw new Error("secret-network");
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new GroqGateway("synthetic").generate("test", [], {
      signal: AbortSignal.abort(),
    }),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(
    new GroqGateway("synthetic").generate("test", []),
  ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("uploads transient WAV as multipart and sends the exact saved reply for one WAV synthesis", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ text: "Five, no, ten milligrams." }))
    .mockResolvedValueOnce(new Response(wav));
  vi.stubGlobal("fetch", fetcher);
  const gateway = new GroqSpeechGateway("synthetic");
  expect(await gateway.transcribe(wav)).toBe("Five, no, ten milligrams.");
  expect(gateway.transcriptionModel).toBe("whisper-large-v3-turbo");
  const form = fetcher.mock.calls[0][1].body as FormData;
  expect(form.get("model")).toBe("whisper-large-v3-turbo");
  expect(
    new Uint8Array(await (form.get("file") as Blob).arrayBuffer()),
  ).toEqual(wav);
  expect(await gateway.synthesize("Exact saved reply.")).toEqual(wav);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
    model: "canopylabs/orpheus-v1-english",
    voice: "hannah",
    input: "Exact saved reply.",
    response_format: "wav",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("fails speech safely without retries for quota, invalid audio and excessive input", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(new Response("not wav"));
  vi.stubGlobal("fetch", fetcher);
  const gateway = new GroqSpeechGateway("synthetic");
  await expect(gateway.transcribe(wav)).rejects.toThrow("RATE_LIMITED");
  await expect(gateway.synthesize("Hello")).rejects.toThrow(
    "PROVIDER_UNAVAILABLE",
  );
  await expect(gateway.synthesize("x".repeat(10001))).rejects.toThrow(
    "VALIDATION_FAILED",
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("identifies the one-time model terms setup without leaking provider messages or retrying", async () => {
  const fetcher = vi.fn(async () =>
    Response.json(
      {
        error: {
          code: "model_terms_required",
          message: "secret-provider-text",
        },
      },
      { status: 400 },
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    new GroqSpeechGateway("synthetic").synthesize("Test"),
  ).rejects.toThrow("CONFIGURATION_REQUIRED");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("requests schema-constrained patient replies in one call and keeps actions separate from text", async () => {
  const value = {
    text: "Review this message before sending.",
    dialogue: {
      topic: "health",
      decision: "clinical_review",
      question: { kind: "none", subject: "" },
    },
    sourceQuotes: [],
    action: {
      kind: "message",
      connectionId: null,
      practitionerId: null,
      draft: "Would taking this medicine help?",
    },
  };
  const fetcher = vi.fn(async () => completion(JSON.stringify(value)));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await new GroqGateway("synthetic").patientReply("Synthetic policy", [
      { role: "user", content: "Help me ask my doctor." },
    ]),
  ).toEqual(value);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(
      String(
        (fetcher.mock.calls as unknown as [string, RequestInit][])[0][1].body,
      ),
    ).response_format,
  ).toMatchObject({
    type: "json_schema",
    json_schema: {
      name: "patient_reply",
      strict: true,
      schema: { additionalProperties: false },
    },
  });
});
