import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  practitionerToday,
  saveAvailability,
  removeAvailability,
} from "@/features/practitioner/daily";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    return success(await practitionerToday(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({ action: z.enum(["add", "remove"]), data: z.unknown() })
      .strict()
      .parse(await jsonBody(r));
    return success(
      await (d.action === "add" ? saveAvailability : removeAvailability)(
        database(),
        sessionFrom(r),
        d.data,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
