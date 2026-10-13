import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  patientConnections,
  setPatientConsent,
} from "@/features/access/patient-controls";
import { revokeConnection } from "@/features/access/server";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(request: NextRequest) {
  try {
    return success(await patientConnections(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const input = z
      .object({ action: z.enum(["consent", "revoke"]), data: z.unknown() })
      .strict()
      .parse(await jsonBody(request));
    if (input.action === "revoke") {
      await revokeConnection(
        database(),
        sessionFrom(request),
        z.object({ id: z.uuid() }).strict().parse(input.data).id,
      );
      return success();
    }
    return success(
      await setPatientConsent(database(), sessionFrom(request), input.data),
    );
  } catch (error) {
    return failure(error);
  }
}
