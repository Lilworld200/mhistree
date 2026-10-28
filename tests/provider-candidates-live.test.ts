import { expect, it } from "vitest";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import {
  CompatibleGateway,
  type CompatibleProvider,
} from "@/lib/ai/compatible";
import { patientChatPolicy } from "@/features/ai-chat/patient-prompt";
import { careActionPolicy } from "@/features/ai-chat/care-action-schema";
import { continuityPolicy } from "@/features/ai-chat/temporal";

it.runIf(process.env.MHISTREE_LIVE_PROVIDER_CANDIDATES === "1")(
  "auditions explicit free candidates using invented identity, dated recall and reviewed contact",
  async () => {
    await mkdir(".local/provider-evaluation", { recursive: true });
    const env = { ...parseEnv(await readFile(".env", "utf8")), ...process.env };
    const candidates: [CompatibleProvider, string][] = [
      ["openrouter", "thinkingmachines/inkling:free"],
      ["openrouter", "google/gemma-4-31b-it:free"],
      ["openrouter", "nvidia/nemotron-3-ultra-550b-a55b:free"],
      ["nvidia", "nvidia/nemotron-3-ultra-550b-a55b"],
      ["nvidia", "nvidia/nemotron-3.5-lightning-30b-a3b"],
    ];
    const recipient = {
      name: "Dr Synthetic Example",
      connectionId: "11111111-1111-4111-8111-111111111111",
      practitionerId: "22222222-2222-4222-8222-222222222222",
      kind: "direct",
      revision: 1,
      canMessage: true,
      categories: ["symptom"],
    };
    const context = {
      profile: { name: "Ada Synthetic", birthDate: "1994-05-06" },
      currentTime: { local: "2026-10-28" },
      evidence: [
        {
          text: "The patient reported trouble sleeping on October 26, 2026.",
          category: "symptom",
          status: "unknown",
          eventTime: {
            precision: "range",
            from: "2026-10-26T00:00:00Z",
            to: "2026-10-27T00:00:00Z",
          },
          capturedAt: "2026-10-27T07:00:00Z",
        },
      ],
      status: "available",
      connectedPractitioners: [recipient],
      appointmentRecipients: [],
      medicationSafety: { items: [], incomplete: true },
    };
    const results = await Promise.all(
      candidates.map(async ([provider, model]) => {
        const started = Date.now();
        try {
          const gateway = new CompatibleGateway(
            env[
              provider === "openrouter"
                ? "OPENROUTER_API_KEY"
                : "NVIDIA_API_KEY"
            ]!,
            provider,
            model,
          );
          const reply = await gateway.patientReply(
            `${patientChatPolicy}\n${careActionPolicy}\n${continuityPolicy}\nAuthorized synthetic context: ${JSON.stringify(context)}`,
            [
              {
                role: "user",
                content:
                  "What is my stored name and birth date? What did I report about sleep on my timeline? Please help me message Dr Synthetic Example about that sleep problem.",
              },
            ],
          );
          const checks = {
            name: /Ada/.test(reply.text),
            dob: /1994/.test(reply.text) && /May|05/.test(reply.text),
            recall: /sleep/i.test(reply.text) && /26/.test(reply.text),
            proposal: reply.action?.kind === "message",
            noFalseSend:
              !/(?:I have|I've|I’ve) (?:sent|contacted|notified)/i.test(
                reply.text,
              ),
          };
          return {
            provider,
            model,
            ms: Date.now() - started,
            passed: Object.values(checks).every(Boolean),
            checks,
            reply,
          };
        } catch (error) {
          return {
            provider,
            model,
            ms: Date.now() - started,
            passed: false,
            error: error instanceof Error ? error.message : "failed",
          };
        }
      }),
    );
    await writeFile(
      ".local/provider-evaluation/candidates.json",
      JSON.stringify(results, null, 2),
    );
    for (const result of results)
      console.info(
        JSON.stringify({
          provider: result.provider,
          model: result.model,
          ms: result.ms,
          passed: result.passed,
          checks: result.checks,
          error: result.error,
        }),
      );
    expect(results.some((r) => r.passed)).toBe(true);
  },
  90000,
);
