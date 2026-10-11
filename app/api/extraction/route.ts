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
} from "@/features/ai-chat/extraction/server";
export async function GET(request: NextRequest) {
  try {
    return success(await extractionStatus(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const { id } = z
      .object({ id: z.uuid() })
      .strict()
      .parse(await jsonBody(request));
    return success(
      await processExtraction(
        database(),
        sessionFrom(request),
        id,
        aiGateway(),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
