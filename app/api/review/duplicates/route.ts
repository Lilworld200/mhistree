import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  duplicateQueue,
  duplicatePreview,
  reviewDuplicate,
} from "@/features/identity/duplicates";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    const id = r.nextUrl.searchParams.get("id");
    return success(
      id
        ? await duplicatePreview(database(), sessionFrom(r), id)
        : await duplicateQueue(database(), sessionFrom(r)),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    return success(
      await reviewDuplicate(database(), sessionFrom(r), await jsonBody(r)),
    );
  } catch (e) {
    return failure(e);
  }
}
