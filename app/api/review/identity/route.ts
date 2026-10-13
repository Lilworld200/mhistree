import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  identitySupportQueue,
  reviewIdentitySupport,
  designateRecovery,
} from "@/features/identity/assistance";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    return success(await identitySupportQueue(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({ action: z.enum(["review", "designate"]), data: z.unknown() })
      .strict()
      .parse(await jsonBody(r));
    return success(
      await { review: reviewIdentitySupport, designate: designateRecovery }[
        d.action
      ](database(), sessionFrom(r), d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
