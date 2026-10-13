import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  organizationStaff,
  inviteStaff,
  updateMembership,
  myInvitations,
  respondInvitation,
} from "@/features/organizations/membership";
import {
  connectOrganization,
  assignPatient,
  assignedPatients,
} from "@/features/organizations/assignments";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    const pool = database(),
      session = sessionFrom(r),
      org = r.nextUrl.searchParams.get("organization");
    return success(
      org
        ? await organizationStaff(pool, session, z.uuid().parse(org))
        : {
            invitations: await myInvitations(pool, session),
            patients: await assignedPatients(pool, session),
          },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({
        action: z.enum([
          "invite",
          "membership",
          "respond",
          "connect",
          "assign",
        ]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r));
    return success(
      await {
        invite: inviteStaff,
        membership: updateMembership,
        respond: respondInvitation,
        connect: connectOrganization,
        assign: assignPatient,
      }[d.action](database(), sessionFrom(r), d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
