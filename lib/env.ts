import "server-only";
import { z } from "zod";
import { DomainError } from "./errors";
const databaseSchema = z.object({
  DATABASE_URL: z.url().refine((v) => /^postgres(ql)?:\/\//.test(v)),
  DATABASE_SSL: z.enum(["verify-full", "local"]).default("verify-full"),
  DATABASE_SSL_CA_FILE: z.string().min(1).optional(),
});
export function databaseEnvironment(
  input: Record<string, string | undefined> = process.env,
) {
  const result = databaseSchema.safeParse(input);
  if (!result.success) throw new DomainError("CONFIGURATION_REQUIRED");
  const url = new URL(result.data.DATABASE_URL);
  if (
    result.data.DATABASE_SSL === "local" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new DomainError("CONFIGURATION_REQUIRED");
  return result.data;
}
