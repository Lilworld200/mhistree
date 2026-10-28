import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

export function speechConfiguration() {
  const provider =
    process.env.AI_SPEECH_PROVIDER ??
    (process.env.AI_PROVIDER === "gemini" ? "gemini" : "groq");
  if (provider !== "groq" && provider !== "gemini")
    throw new DomainError("CONFIGURATION_REQUIRED");
  const result = z
    .object({
      key: z.string().trim().min(1),
      AUTH_FLOW_COOKIE_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    })
    .safeParse({
      ...process.env,
      key:
        provider === "groq"
          ? process.env.GROQ_API_KEY
          : process.env.GEMINI_API_KEY,
    });
  if (!result.success) throw new DomainError("CONFIGURATION_REQUIRED");
  return { ...result.data, provider };
}
