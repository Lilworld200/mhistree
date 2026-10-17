import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { patientChatPolicy } from "@/features/ai-chat/patient-prompt";
import { GeminiGateway, type AIMessage } from "@/lib/ai/gateway";

// Real provider smoke/rubric cases; all input is synthetic. No database or patient records.
// Review the saved synthetic replies too; mechanical checks do not certify empathy or clinical safety.
describe.runIf(process.env.MHISTREE_LIVE_AI_TEST === "1")(
  "default patient conversation voice (live)",
  () => {
    const samples: { scenario: string; input: string; reply: string }[] = [];
    afterAll(async () => {
      await mkdir(".local", { recursive: true });
      await writeFile(".local/patient-chat-voice-review.json", JSON.stringify(samples, null, 2));
    });
    it.each([
      { name: "stress without an intake form", turns: ["Ah, my day was stressful."] },
      {
        name: "jogging then knee pain without assumed causation",
        turns: ["Damn, jogging today was stressful.", "Now it hurts just below my knee."],
      },
      { name: "headache without logging announcements", turns: ["I have a headache."] },
      {
        name: "respect a conversational stopping point",
        turns: ["I just want to rest, no more questions."],
      },
    ])("$name", async ({ name, turns }) => {
      const env = { ...parseEnv(await readFile(".env", "utf8")), ...process.env };
      if (!env.GEMINI_API_KEY || !env.AI_PATIENT_MODEL || !env.AI_EXTRACTION_MODEL)
        throw new Error("Live voice evaluation requires configured Gemini model fields");
      const gateway = new GeminiGateway({
        key: env.GEMINI_API_KEY,
        chatModel: env.AI_PATIENT_MODEL,
        extractionModel: env.AI_EXTRACTION_MODEL,
      });
      const history: AIMessage[] = [];
      for (const turn of turns) {
        history.push({ role: "user", content: turn });
        const reply = await gateway.generate(
          `${patientChatPolicy}\nCurrent authorized record context: No record evidence supplied for this synthetic conversation.`,
          history,
        );
        samples.push({ scenario: name, input: turn, reply });
        expect(reply.trim().split(/\s+/).length).toBeLessThanOrEqual(120);
        expect((reply.match(/\?/g) ?? []).length).toBeLessThanOrEqual(1);
        expect(reply).not.toMatch(/\b(?:I've|I have|I'll|I will)\s+(?:saved|logged|recorded|registered|save|log|record|register)\b/i);
        expect(reply).not.toMatch(/^(?:#{1,6}\s|[-*]\s|\d+\.\s)/m);
        if (turn.includes("no more questions")) expect(reply).not.toContain("?");
        history.push({ role: "assistant", content: reply });
      }
    }, 120000);
  },
);
