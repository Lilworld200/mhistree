import { NextRequest, NextResponse } from "next/server";

// Local host aliases are separate cookie origins. Use one before starting PKCE.
export function proxy(request: NextRequest) {
  const configured = process.env.APP_ORIGIN;
  if (configured && (request.method === "GET" || request.method === "HEAD")) {
    const target = new URL(configured);
    const current = new URL(request.url);
    // NextURL normalizes 127.0.0.1 to localhost; use the actual HTTP Host.
    const host = request.headers.get("host");
    if (host) current.host = host;
    const loopback = (host: string) =>
      host === "localhost" || host === "127.0.0.1";
    if (
      loopback(target.hostname) &&
      loopback(current.hostname) &&
      target.protocol === current.protocol &&
      target.port === current.port &&
      target.hostname !== current.hostname
    ) {
      const url = new URL(current.pathname + current.search, target.origin);
      // Next rewrites loopback Location headers into relative URLs. A browser
      // refresh preserves the actual host change and avoids a redirect loop.
      return new NextResponse(null, {
        headers: { Refresh: `0;url=${url.href}`, "Cache-Control": "no-store" },
      });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api/|_next/|favicon.ico).*)"] };
