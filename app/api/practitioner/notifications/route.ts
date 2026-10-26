import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import { failure, sessionFrom, success } from "@/lib/http";
import { practitionerNotifications } from "@/features/practitioner/notifications";
export async function GET(request: NextRequest) {
  try {
    return success(
      await practitionerNotifications(database(), sessionFrom(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
