import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import { flagDuplicate } from "@/features/identity/duplicates";
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
    return success(
      await flagDuplicate(database(), sessionFrom(r), await jsonBody(r)),
    );
  } catch (e) {
    return failure(e);
  }
}
