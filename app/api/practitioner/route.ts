import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  professionalProfile,
  submitProfessional,
} from "@/features/practitioner/profile";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    return success(await professionalProfile(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    return success(
      await submitProfessional(
        database(),
        sessionFrom(r),
        await jsonBody(r, 8 * 1024 * 1024),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
