import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

export function speechConfiguration() {
  const result = z
    .object({
      GEMINI_API_KEY: z.string().min(1),
      AUTH_FLOW_COOKIE_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    })
    .safeParse(process.env);
  if (!result.success) throw new DomainError("CONFIGURATION_REQUIRED");
  return result.data;
}
