import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { KeycloakProvider } from "./keycloak";
const schema = z.object({
  AUTH_BASE_URL: z.url(),
  AUTH_REALM: z.string().min(1),
  AUTH_CLIENT_ID: z.string().min(1),
  AUTH_CLIENT_SECRET: z.string().min(32),
});
export function authenticationProvider(
  input: Record<string, string | undefined> = process.env,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError("CONFIGURATION_REQUIRED");
  const c = parsed.data;
  return new KeycloakProvider({
    baseUrl: c.AUTH_BASE_URL,
    realm: c.AUTH_REALM,
    clientId: c.AUTH_CLIENT_ID,
    clientSecret: c.AUTH_CLIENT_SECRET,
  });
}
