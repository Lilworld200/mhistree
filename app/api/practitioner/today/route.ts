import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  practitionerToday,
  saveAvailability,
  updateAvailability,
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
    const from = r.nextUrl.searchParams.get("from"),
      to = r.nextUrl.searchParams.get("to");
    const range =
      from || to
        ? z.object({ from: z.string(), to: z.string() }).parse({ from, to })
        : undefined;
    return success(await practitionerToday(database(), sessionFrom(r), range));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({
        action: z.enum(["add", "update", "remove"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r));
    return success(
      await {
        add: saveAvailability,
        update: updateAvailability,
        remove: removeAvailability,
      }[d.action](database(), sessionFrom(r), d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
