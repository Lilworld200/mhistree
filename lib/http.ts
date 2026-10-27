import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { DomainError, applicationErrorCode } from "./errors";
export const sessionCookie = "mhistree-session";
export const setupCookie = "mhistree-setup";
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
}
export function mutationGuard(request: Request) {
  const expected = process.env.APP_ORIGIN;
  if (!expected) throw new DomainError("CONFIGURATION_REQUIRED");
  if (
    request.headers.get("origin") !== new URL(expected).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new DomainError("ACCESS_DENIED");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError("ACCESS_DENIED");
}
export async function jsonBody(
  request: Request,
  limit = 16384,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("ACCESS_DENIED");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > limit) {
        await reader.cancel();
        throw new DomainError("ACCESS_DENIED");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export function sessionFrom(request: NextRequest) {
  return request.cookies.get(sessionCookie)?.value ?? "";
}
// A conservative shared bucket until a deployment defines and validates its trusted proxy chain.
// Never trust an arbitrary X-Forwarded-For value supplied by an Internet client.
export function requestRateKey() {
  return "first-party-entry";
}
export function success(data: unknown = {}) {
  return NextResponse.json(
    { ok: true, data },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
export function failure(error: unknown) {
  const code =
    error instanceof DomainError
      ? error.code
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? "VALIDATION_FAILED"
        : applicationErrorCode(error);
  if (code === "DATABASE_PERMISSION_DENIED")
    console.error(
      "[MHISTREE DB]",
      JSON.stringify({
        event: "request.permission-denied",
        code,
        sqlState: "42501",
      }),
    );
  const status =
    code === "DATABASE_PERMISSION_DENIED"
      ? 500
      : code === "AUTH_REQUIRED" || code === "SESSION_RETIRED"
        ? 401
        : code === "ACCESS_DENIED" || code === "ACCESS_REVOKED"
          ? 403
          : code === "VERSION_CONFLICT" ||
              code === "MEMORY_PREPARATION_REQUIRED" ||
              code === "IDENTITY_REVIEW_REQUIRED"
            ? 409
            : code === "RATE_LIMITED"
              ? 429
              : code === "VALIDATION_FAILED" || code === "TOKEN_INVALID"
                ? 422
                : 503;
  return NextResponse.json(
    { ok: false, error: { code, requestId: crypto.randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
