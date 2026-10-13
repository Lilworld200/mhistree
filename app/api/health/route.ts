import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { healthState } from "@/features/health-records/current-state";
import {
  correctPatientReport,
  requestReview,
} from "@/features/health-records/corrections";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(request: NextRequest) {
  try {
    return success(await healthState(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const input = z
      .object({ action: z.enum(["correct", "review"]), data: z.unknown() })
      .strict()
      .parse(await jsonBody(request));
    return success(
      await (input.action === "correct" ? correctPatientReport : requestReview)(
        database(),
        sessionFrom(request),
        input.data,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
