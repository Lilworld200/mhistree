import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { aiGateway } from "@/lib/ai/gateway";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
import {
  createConversation,
  listConversations,
  conversationHistory,
  sendMessage,
  cancelReply,
} from "@/features/ai-chat/server";
import { retryPatientReply } from "@/features/ai-chat/assessment";
import { aiDebug, aiDebugError, withAIDebug } from "@/lib/ai/debug";
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    return success(
      id
        ? await conversationHistory(
            database(),
            sessionFrom(request),
            id,
            request.nextUrl.searchParams.get("before") ?? undefined,
          )
        : await listConversations(database(), sessionFrom(request)),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  return withAIDebug({ operation: "chat.http" }, () => chatRequest(request));
}
async function chatRequest(request: NextRequest) {
  try {
    mutationGuard(request);
    const input = z
      .object({
        action: z.enum(["create", "send", "generate", "cancel"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(request));
    const pool = database(),
      session = sessionFrom(request);
    aiDebug("chat.http.action", { reason: input.action });
    if (input.action === "send")
      return success(await sendMessage(pool, session, input.data));
    const { id } = z.object({ id: z.uuid() }).strict().parse(input.data);
    if (input.action === "create")
      return success(await createConversation(pool, session, id));
    if (input.action === "cancel")
      return success(await cancelReply(pool, session, id));
    return success(
      await retryPatientReply(pool, session, id, aiGateway(), request.signal),
    );
  } catch (error) {
    aiDebugError("chat.http.failed", error);
    return failure(error);
  }
}
