import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { authenticationProvider as authProvider } from "@/lib/auth/config";
import {
  signupEmail,
  setupEmail,
  loginEmail,
  confirmEmail,
  requestEmailReset,
  resetEmailPassword,
  resendVerification,
} from "@/features/auth/email";
import { redeemCredential, signOut } from "@/features/auth/server";
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
    if(operation === "resend-verification") {
      const {email}=z.object({email:z.email().max(254)}).strict().parse(input);
      return success(await resendVerification(pool,authProvider(),email,rate));
    }
    if (operation === "signup")
      return success(await signupEmail(pool, authProvider(), input, rate));
    if (operation === "reset-email") {
      const { email } = z
        .object({ email: z.email().max(254) })
        .strict()
        .parse(input);
      return success(
        await requestEmailReset(pool, authProvider(), email, rate),
      );
    }
    if (operation === "reset-password") {
      const { token, password } = z
        .object({
          token: z.string().min(1).max(8192),
          password: z.string().min(12).max(128),
        })
        .strict()
        .parse(input);
      const response = success(
        await resetEmailPassword(pool, authProvider(), token, password, rate),
      );
      response.cookies.set(sessionCookie, "", {
        ...cookieOptions(),
        maxAge: 0,
      });
      return response;
    }
    if (operation === "confirm") {
      const { token } = z
        .object({ token: z.string().min(1).max(8192) })
        .strict()
        .parse(input);
      const result = await confirmEmail(pool, authProvider(), token, rate);
      const response = success({ next: "/chat" });
      response.cookies.set(sessionCookie, result.session, {
        ...cookieOptions(),
        expires: result.expiresAt,
      });
      return response;
    }
    if (operation === "redeem") {
      const result = await redeemCredential(
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
      const result = await setupEmail(
        pool,
        authProvider(),
        input,
        request.cookies.get(setupCookie)?.value ?? "",
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
      const result = await loginEmail(
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
