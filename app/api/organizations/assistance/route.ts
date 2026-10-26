import { credentialLockDatabase } from "@/lib/db/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { authenticationProvider } from "@/lib/auth/config";
import {
  assistedCredential,
  escalateIdentity,
} from "@/features/identity/assistance";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({ action: z.enum(["issue", "escalate"]), data: z.unknown() })
      .strict()
      .parse(await jsonBody(r));
    return success(
      d.action === "issue"
        ? await assistedCredential(
            database(),
            credentialLockDatabase(),
            authenticationProvider(),
            sessionFrom(r),
            d.data,
          )
        : await escalateIdentity(database(), sessionFrom(r), d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
