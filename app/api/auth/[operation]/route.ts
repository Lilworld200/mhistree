import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { authenticationProvider as authProvider } from "@/lib/auth/config";
import { beginRegistration } from "@/features/patient/account/server";
import {
  completeSetup,
  redeemCredential,
  signIn,
  signOut,
} from "@/features/auth/server";
import {
  mutationGuard,
  jsonBody,
  requestRateKey,
  sessionFrom,
  sessionCookie,
  setupCookie,
  cookieOptions,
  success,
  failure,
} from "@/lib/http";
import { DomainError } from "@/lib/errors";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  try {
    mutationGuard(request);
    const { operation } = await params;
    const input = await jsonBody(request);
    const pool = database();
    const rate = requestRateKey();
    if (operation === "signup" || operation === "redeem") {
      const result =
        operation === "signup"
          ? await beginRegistration(pool, input, rate)
          : await redeemCredential(
              pool,
              z
                .object({ code: z.string().min(1).max(200) })
                .strict()
                .parse(input).code,
              rate,
            );
      const response = success({ next: "setup" });
      response.cookies.set(setupCookie, result.setupSession, {
        ...cookieOptions(),
        maxAge: 600,
      });
      return response;
    }
    if (operation === "setup") {
      const data = z
        .object({ password: z.string().min(12).max(128) })
        .strict()
        .parse(input);
      const result = await completeSetup(
        pool,
        authProvider(),
        request.cookies.get(setupCookie)?.value ?? "",
        data.password,
        rate,
      );
      const response = success(result);
      response.cookies.set(setupCookie, "", { ...cookieOptions(), maxAge: 0 });
      return response;
    }
    if (operation === "login") {
      const data = z
        .object({
          identifier: z.string().min(1).max(254),
          password: z.string().min(1).max(128),
        })
        .strict()
        .parse(input);
      const result = await signIn(
        pool,
        authProvider(),
        data.identifier,
        data.password,
        rate,
      );
      const response = success({ next: "/chat" });
      response.cookies.set(sessionCookie, result.session, {
        ...cookieOptions(),
        expires: result.expiresAt,
      });
      return response;
    }
    if (operation === "logout") {
      try {
        await signOut(pool, sessionFrom(request));
      } catch (error) {
        if (
          !(error instanceof DomainError) ||
          !["AUTH_REQUIRED", "SESSION_RETIRED"].includes(error.code)
        )
          throw error;
      }
      const response = success();
      response.cookies.set(sessionCookie, "", {
        ...cookieOptions(),
        maxAge: 0,
      });
      return response;
    }
    throw new DomainError("ACCESS_DENIED");
  } catch (error) {
    return failure(error);
  }
}
