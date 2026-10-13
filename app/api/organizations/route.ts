import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  myOrganizations,
  registerOrganization,
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
    return success(await myOrganizations(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    return success(
      await registerOrganization(database(), sessionFrom(r), await jsonBody(r)),
    );
  } catch (e) {
    return failure(e);
  }
}
