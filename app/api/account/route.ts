import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  accountProfile,
  updateProfile,
  addContact,
  removeContact,
} from "@/features/patient/account/server";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(request: NextRequest) {
  try {
    return success(await accountProfile(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const input = z
      .object({
        action: z.enum(["profile", "add-contact", "remove-contact"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(request));
    const pool = database(),
      session = sessionFrom(request);
    if (input.action === "profile")
      return success(await updateProfile(pool, session, input.data));
    if (input.action === "add-contact")
      await addContact(pool, session, input.data);
    else
      await removeContact(
        pool,
        session,
        z.object({ id: z.uuid() }).strict().parse(input.data).id,
      );
    return success();
  } catch (error) {
    return failure(error);
  }
}
