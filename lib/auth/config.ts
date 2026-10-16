import "server-only";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { SupabaseProvider } from "./supabase";
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});
export function authenticationProvider(
  input: Record<string, string | undefined> = process.env,
  verifier: string | null = null,
) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new DomainError("CONFIGURATION_REQUIRED");
  const c = parsed.data;
  const key =
    c.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? c.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new DomainError("CONFIGURATION_REQUIRED");
  return new SupabaseProvider(
    c.NEXT_PUBLIC_SUPABASE_URL,
    key,
    c.SUPABASE_SERVICE_ROLE_KEY,
    verifier,
  );
}
