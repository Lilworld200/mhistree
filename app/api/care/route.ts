import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
import {
  eligibleCareProviders,
  patientRequests,
} from "@/features/patient/care/server";
import {
  listAppointments,
  requestAppointment,
  changeAppointment,
} from "@/features/appointments/server";
import { careMessages, sendCareMessage } from "@/features/messaging/server";
import { patientConnections } from "@/features/access/patient-controls";
export async function GET(request: NextRequest) {
  try {
    const pool = database(),
      session = sessionFrom(request),
      connection = request.nextUrl.searchParams.get("connection");
    if (connection)
      return success(
        await careMessages(
          pool,
          session,
          { kind: "patient" },
          connection,
          request.nextUrl.searchParams.get("before") ?? undefined,
        ),
      );
    const [appointments, providers, requests, controls] = await Promise.all([
      listAppointments(pool, session),
      eligibleCareProviders(pool, session),
      patientRequests(pool, session),
      patientConnections(pool, session),
    ]);
    return success({
      appointments,
      providers,
      requests,
      connections: controls.connections,
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const { action, data } = z
      .object({
        action: z.enum(["book", "appointment", "message"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(request));
    const pool = database(),
      session = sessionFrom(request);
    if (action === "book")
      return success(
        await requestAppointment(pool, session, { kind: "patient" }, data),
      );
    if (action === "appointment")
      return success(
        await changeAppointment(pool, session, { kind: "patient" }, data),
      );
    return success(
      await sendCareMessage(pool, session, { kind: "patient" }, data),
    );
  } catch (error) {
    return failure(error);
  }
}
