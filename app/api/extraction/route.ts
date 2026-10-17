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
  extractionStatus,
  processExtraction,
  enqueueMessageExtraction,
} from "@/features/ai-chat/extraction/server";
import { aiDebugError, withAIDebug } from "@/lib/ai/debug";
export async function GET(request: NextRequest) {
  try {
    return success(await extractionStatus(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  return withAIDebug({ operation: "extraction.http" }, () =>
    processRequest(request),
  );
}
async function processRequest(request: NextRequest) {
  try {
    mutationGuard(request);
    const input = z
      .union([
        z.object({ id: z.uuid() }).strict(),
        z.object({ messageId: z.uuid() }).strict(),
      ])
      .parse(await jsonBody(request));
    const pool = database(),
      session = sessionFrom(request);
    const id =
      "id" in input
        ? input.id
        : await enqueueMessageExtraction(pool, session, input.messageId);
    return success(await processExtraction(pool, session, id, aiGateway()));
  } catch (error) {
    aiDebugError("extraction.http.failed", error);
    return failure(error);
  }
}
