import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import { aiGateway } from "@/lib/ai/gateway";
import { requestAssessment } from "@/features/ai-chat/assessment";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    return success(
      await requestAssessment(
        database(),
        sessionFrom(request),
        await jsonBody(request),
        aiGateway(),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
