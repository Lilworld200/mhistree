import { NextRequest, NextResponse } from "next/server";
import { authenticationProvider } from "@/lib/auth/config";
import {
  openFlow,
  sealFlow,
  verifierCookie,
  recoveryCookie,
  flowCookieOptions,
} from "@/lib/auth/flow-cookie";
import { confirmEmail } from "@/features/auth/email";
import { database } from "@/lib/db/client";
import { cookieOptions, sessionCookie, requestRateKey } from "@/lib/http";
import { DomainError } from "@/lib/errors";
import { entryCookie, professionalEntryPath } from "@/features/auth/entry-path";

export async function GET(request: NextRequest) {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new DomainError("CONFIGURATION_REQUIRED");
  const flow = request.nextUrl.searchParams.get("flow");
  let response: NextResponse;
  try {
    if (flow !== "signup" && flow !== "recovery")
      throw new DomainError("AUTH_REQUIRED");
    const code = request.nextUrl.searchParams.get("code");
    if (
      !code ||
      code.length > 4096 ||
      request.nextUrl.searchParams.has("error")
    )
      throw new DomainError("AUTH_REQUIRED");
    const verifier = await openFlow(
      request.cookies.get(verifierCookie(flow))?.value,
      `pkce-${flow}`,
    );
    const provider = authenticationProvider(process.env, verifier);
    const { token, redirectType } = await provider.exchange(code);
    if (flow === "recovery") {
      const proof = await provider.verify(token);
      if (
        redirectType !== "PASSWORD_RECOVERY" ||
        !proof.methods.some(
          (method) => method === "otp" || method === "recovery",
        )
      )
        throw new DomainError("AUTH_REQUIRED");
      response = NextResponse.redirect(
        new URL("/recovery/update", origin),
        303,
      );
      response.cookies.set(
        recoveryCookie,
        await sealFlow(token, "recovery"),
        flowCookieOptions(),
      );
    } else {
      if (redirectType === "PASSWORD_RECOVERY")
        throw new DomainError("AUTH_REQUIRED");
      const result = await confirmEmail(
        database(),
        provider,
        token,
        requestRateKey(),
      );
      response = NextResponse.redirect(
        new URL(
          professionalEntryPath(request.cookies.get(entryCookie)?.value),
          origin,
        ),
        303,
      );
      response.cookies.set(sessionCookie, result.session, {
        ...cookieOptions(),
        // Email-link navigation originates on the mail provider's site.
        sameSite: "lax",
        expires: result.expiresAt,
      });
    }
  } catch {
    response = NextResponse.redirect(new URL("/auth/confirm", origin), 303);
  }
  if (flow === "signup" || flow === "recovery")
    response.cookies.set(verifierCookie(flow), "", {
      ...flowCookieOptions(),
      maxAge: 0,
    });
  response.headers.set("Cache-Control", "private, no-store");
  if (flow === "signup")
    response.cookies.set(entryCookie, "", {
      ...flowCookieOptions(),
      maxAge: 0,
    });
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
