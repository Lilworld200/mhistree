import { beforeAll, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { GroqGateway } from "@/lib/ai/groq";
import { GroqSpeechGateway } from "@/features/ai-chat/speech/groq-gateway";
import { patientChatPolicy } from "@/features/ai-chat/patient-prompt";
import { continuityPolicy } from "@/features/ai-chat/temporal";

// Only synthetic prompts/audio; no database, account or patient records are read.
const live = process.env.MHISTREE_LIVE_GROQ_TEST === "1";
let key: string;
beforeAll(() => {
  if (!live) return;
  const env = Object.assign(
    {},
    ...[".env", ".env.local"]
      .filter(existsSync)
      .map((path) => parseEnv(readFileSync(path, "utf8"))),
    process.env,
  );
  key = env.GROQ_API_KEY?.trim() ?? "";
  if (!key)
    throw new Error("GROQ_API_KEY is required for the synthetic audition");
});
it.runIf(live)(
  "auditions economical Groq chat, JSON and title without private reasoning",
  async () => {
    const gateway = new GroqGateway(key);
    const reply = await gateway.generate(
      `${patientChatPolicy}\n${continuityPolicy}\nSynthetic test: no record evidence or connected practitioners.`,
      [
        {
          role: "user",
          content: "I finished a day of coding and want to wind down.",
        },
      ],
    );
    expect(reply).not.toMatch(/<think>|analysis\s*:/i);
    const json = await gateway.generate(
      'Return JSON {"items":[{"text":"source fact"}]}. Retain only the supplied statement, without inference.',
      [
        {
          role: "user",
          content: "Synthetic source: I enjoy coding in the evenings.",
        },
      ],
      { json: true, maxOutputTokens: 1024 },
    );
    expect(JSON.parse(json).items).toBeInstanceOf(Array);
    const title = await gateway.generate(
      "Write only a short 3–7 word conversation title. No explanation, names, dates or quotes.",
      [{ role: "user", content: "Winding down after a day of coding." }],
      { maxOutputTokens: 256 },
    );
    expect(title.length).toBeLessThanOrEqual(64);
    await mkdir(".local/groq-audition", { recursive: true });
    await writeFile(
      ".local/groq-audition/review.json",
      JSON.stringify(
        { model: gateway.modelName, reply, json: JSON.parse(json), title },
        null,
        2,
      ),
    );
  },
  150000,
);

it.runIf(live)(
  "auditions a single saved-text speech synthesis and transcription roundtrip",
  async () => {
    const provider = new GroqSpeechGateway(key);
    const wav = await provider.synthesize(
      "This is a synthetic test. I enjoy coding in the evenings.",
    );
    await mkdir(".local/groq-audition", { recursive: true });
    await writeFile(".local/groq-audition/sample.wav", wav);
    const text = await provider.transcribe(wav);
    await writeFile(".local/groq-audition/transcript.txt", text);
    expect(text.toLowerCase()).toContain("coding");
  },
  100000,
);
