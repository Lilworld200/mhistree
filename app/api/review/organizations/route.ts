import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  organizationReviewQueue,
  reviewOrganization,
} from "@/features/organizations/server";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    return success(await organizationReviewQueue(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    return success(
      await reviewOrganization(database(), sessionFrom(r), await jsonBody(r)),
    );
  } catch (e) {
    return failure(e);
  }
}
