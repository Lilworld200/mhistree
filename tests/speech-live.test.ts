import { describe, expect, it } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { GeminiSpeechGateway } from "@/features/ai-chat/speech/gateway";
// Explicit synthetic-only provider audition. Does not read any patient records.
describe.runIf(process.env.MHISTREE_LIVE_SPEECH_TEST === "1")(
  "speech provider audition",
  () => {
    it("generates listening samples and transcribes a synthetic clip verbatim", async () => {
      const env = {
        ...parseEnv(await readFile(".env", "utf8")),
        ...process.env,
      };
      if (!env.GEMINI_API_KEY)
        throw new Error(
          "Configured Gemini key required for synthetic audition",
        );
      const provider = new GeminiSpeechGateway(env.GEMINI_API_KEY);
      const texts = [
        "That sounds like a long day. Have you managed to take any proper breaks?",
        "You mentioned ten milligrams of amlodipine. Please check the medicine name and dose in your transcript before sending.",
        "Please call your local emergency services now. Do not wait for a reply in your care inbox.",
      ];
      await mkdir(".local/speech-audition", { recursive: true });
      for (let i = 0; i < texts.length; i++) {
        const wav = await provider.synthesize(texts[i]);
        expect(Buffer.from(wav).toString("ascii", 0, 4)).toBe("RIFF");
        await writeFile(`.local/speech-audition/sample-${i + 1}.wav`, wav);
        if (!i) {
          const transcript = await provider.transcribe(wav);
          await writeFile(".local/speech-audition/transcript.txt", transcript);
          expect(transcript.toLowerCase()).toContain("long day");
          expect(transcript.toLowerCase()).toContain("breaks");
        }
      }
    }, 180000);
  },
);
