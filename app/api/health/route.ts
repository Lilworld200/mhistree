import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { withAccess } from "@/features/access/server";
import { dismissRecommendation } from "@/features/clinical-care/medication-recommendations";
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
      .object({
        action: z.enum(["correct", "review", "dismiss-recommendation"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(request));
    if (input.action === "dismiss-recommendation") {
      const data = z
        .object({ id: z.uuid(), version: z.number().int().positive() })
        .strict()
        .parse(input.data);
      return success(
        await withAccess(
          database(),
          sessionFrom(request),
          { kind: "patient" },
          (a) => dismissRecommendation(a, data.id, data.version),
        ),
      );
    }
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
