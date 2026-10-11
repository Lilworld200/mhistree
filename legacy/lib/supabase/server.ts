/**
 * Supabase server client — for use in Server Components, API Routes, and Server Actions.
 * Uses the SERVICE_ROLE key for privileged operations (bypasses RLS where needed).
 * NEVER import this file in Client Components.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Session-aware server client — respects Row Level Security (RLS).
 * Use this for most read/write operations on behalf of a logged-in user.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component — cookie mutation is a no-op from RSC
          }
        },
      },
    },
  );
}

/**
 * Admin client with SERVICE_ROLE privileges — bypasses RLS entirely.
 * Use only for background jobs: memory extraction, embedding ingestion, audit logging.
 * ⚠️  Never expose this to the browser or return its data unfiltered.
 */
export function createAdminSupabaseClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
