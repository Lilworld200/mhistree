/**
 * Next.js Middleware — Supabase Auth Session Refresh
 * Runs on every request to keep the user's Supabase auth session alive.
 * Required by @supabase/ssr for server-side session management.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session if it exists — do NOT remove this line
  try {
    const { error } = await supabase.auth.getUser();
    if (
      error &&
      (error.status === 400 || error.status === 401)
    ) {
      const staleCookies = request.cookies
        .getAll()
        .filter(({ name }) => name.startsWith("sb-"));
      if (staleCookies.length > 0) {
        supabaseResponse = NextResponse.next({ request });
        staleCookies.forEach(({ name }) => {
          request.cookies.delete(name);
          supabaseResponse.cookies.delete(name);
        });
      }
    }
  } catch {
    // Transient network failure — keep cookies and let the client retry.
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image  (image optimization)
     * - favicon.ico / sitemap.xml / robots.txt
     * - Public assets (images, icons, logos)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
