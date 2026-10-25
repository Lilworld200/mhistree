import { directPatientCards } from "@/features/practitioner/patient-overview";
import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  practitionerLookup,
  registerDirectPatient,
  initiateDirectConnection,
  respondDirectConnection,
} from "@/features/practitioner/patients";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    return success(await directPatientCards(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({
        action: z.enum(["lookup", "register", "connect", "respond"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r));
    return success(
      await {
        lookup: practitionerLookup,
        register: registerDirectPatient,
        connect: initiateDirectConnection,
        respond: respondDirectConnection,
      }[d.action](database(), sessionFrom(r), d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
