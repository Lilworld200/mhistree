import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { authenticationProvider } from "@/lib/auth/config";
import { reconcileRetiredSessions } from "@/features/auth/reconciliation";
import {
  mergeIdentities,
  previewReversal,
  reverseMerge,
} from "@/features/identity/merge";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    return success(
      await previewReversal(
        database(),
        sessionFrom(r),
        z.uuid().parse(r.nextUrl.searchParams.get("operation")),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({
        action: z.enum(["merge", "reverse", "retire-sessions"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r));
    const pool = database(),
      session = sessionFrom(r);
    if (d.action === "retire-sessions")
      return success(
        await reconcileRetiredSessions(
          pool,
          authenticationProvider(),
          session,
          z.object({ personId: z.uuid() }).strict().parse(d.data).personId,
        ),
      );
    if (d.action === "reverse")
      return success(await reverseMerge(pool, session, d.data));
    const result = await mergeIdentities(pool, session, d.data);
    let providerRevocationPending = false;
    try {
      await reconcileRetiredSessions(
        pool,
        authenticationProvider(),
        session,
        result.loserId,
      );
    } catch {
      providerRevocationPending = true;
    }
    return success({ ...result, providerRevocationPending });
  } catch (e) {
    return failure(e);
  }
}
