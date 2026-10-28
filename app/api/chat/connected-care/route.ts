import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
import { connectedChat } from "@/features/messaging/connected-chat";
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    return success(
      await connectedChat(
        database(),
        sessionFrom(request),
        await jsonBody(request, 131072),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
