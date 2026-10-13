import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  registerOrganizationPatient,
  organizationLookup,
  establishInitialCare,
} from "@/features/organizations/care";
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
    const d = z
      .object({
        action: z.enum(["register", "lookup", "initial-care"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r));
    return success(
      await {
        register: registerOrganizationPatient,
        lookup: organizationLookup,
        "initial-care": establishInitialCare,
      }[d.action](database(), sessionFrom(r), d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
