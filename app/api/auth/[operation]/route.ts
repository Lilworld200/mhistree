import {
  withAuthDebug,
  authDebugStage,
  authDebugError,
} from "@/lib/auth/temporary-debug";
import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { authenticationProvider as authProvider } from "@/lib/auth/config";
import {
  signupEmail,
  setupEmail,
  loginEmail,
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
import {
  recoveryCookie,
  verifierCookie,
  flowCookieOptions,
  sealFlow,
  openFlow,
} from "@/lib/auth/flow-cookie";
import { DomainError } from "@/lib/errors";
import { defaultAccountPath } from "@/features/auth/workspace-access";
import {
  professionalEntry,
  professionalEntryPath,
  entryCookie,
} from "@/features/auth/entry-path";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ operation: string }> },
) {
  return withAuthDebug(async () => {
    try {
      authDebugStage("auth.origin-check");
      mutationGuard(request);
      const { operation } = await params;
      authDebugStage(`auth.${operation}.parse-body`);
      const input = await jsonBody(request);
      authDebugStage("auth.database-config");
      const pool = database();
      const rate = requestRateKey();
      const flow = operation === "reset-email" ? "recovery" : "signup";
      let verifier: string | null = null;
      const previous = request.cookies.get(verifierCookie(flow))?.value;
      if (previous) {
        try {
          verifier = await openFlow(previous, `pkce-${flow}`);
        } catch {
          /* expired flow starts anew */
        }
      }
      if (
        ["signup", "setup", "reset-email", "resend-verification"].includes(
          operation,
        )
      ) {
        authDebugStage("auth.flow-cookie-key");
        await sealFlow("configuration-check", `pkce-${flow}`);
      }
      authDebugStage("auth.provider-config");
      const provider = authProvider(process.env, verifier);
      async function emailResponse(data: unknown) {
        authDebugStage("auth.email-response-cookie");
        const response = success(data);
        if (provider.verifier)
          response.cookies.set(
            verifierCookie(flow),
            await sealFlow(provider.verifier, `pkce-${flow}`),
            { ...flowCookieOptions(), maxAge: 3600 },
          );
        return response;
      }
      if (operation === "resend-verification") {
        if (!verifier) throw new DomainError("AUTH_REQUIRED");
        const { email } = z
          .object({ email: z.email().max(254) })
          .strict()
          .parse(input);
        return emailResponse(
          await resendVerification(pool, provider, email, rate),
        );
      }
      if (operation === "signup") {
        const { entry, ...credentials } = z
          .object({ entry: professionalEntry.optional() })
          .passthrough()
          .parse(input);
        const response = await emailResponse(
          await signupEmail(pool, provider, credentials, rate),
        );
        response.cookies.set(entryCookie, entry ?? "", {
          ...flowCookieOptions(),
          maxAge: entry ? 3600 : 0,
        });
        return response;
      }
      if (operation === "reset-email") {
        const { email } = z
          .object({ email: z.email().max(254) })
          .strict()
          .parse(input);
        return emailResponse(
          await requestEmailReset(pool, provider, email, rate),
        );
      }
      if (operation === "reset-password") {
        const { password } = z
          .object({
            password: z.string().min(12).max(128),
          })
          .strict()
          .parse(input);
        const response = success(
          await resetEmailPassword(
            pool,
            provider,
            await openFlow(
              request.cookies.get(recoveryCookie)?.value,
              "recovery",
            ),
            password,
            rate,
          ),
        );
        response.cookies.set(sessionCookie, "", {
          ...cookieOptions(),
          maxAge: 0,
        });
        response.cookies.set(recoveryCookie, "", {
          ...flowCookieOptions(),
          maxAge: 0,
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
          provider,
          input,
          request.cookies.get(setupCookie)?.value ?? "",
          rate,
        );
        const response = await emailResponse(result);
        response.cookies.set(setupCookie, "", {
          ...cookieOptions(),
          maxAge: 0,
        });
        return response;
      }
      if (operation === "login") {
        const data = z
          .object({
            identifier: z.string().min(1).max(254),
            password: z.string().min(1).max(128),
            entry: professionalEntry.optional(),
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
        const response = success({
          next: data.entry
            ? professionalEntryPath(data.entry)
            : await defaultAccountPath(pool, result.session),
        });
        response.cookies.set(entryCookie, "", {
          ...flowCookieOptions(),
          maxAge: 0,
        });
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
      authDebugError(error);
      return failure(error);
    }
  });
}
