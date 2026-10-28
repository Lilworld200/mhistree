import { scheduleInboxAnalysis } from "@/features/messaging/schedule-analysis";
import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
import {
  careProposalOptions,
  changeCareProposal,
} from "@/features/ai-chat/care-actions";

export const maxDuration = 120;
export async function GET(request: NextRequest) {
  try {
    return success(
      await careProposalOptions(
        database(),
        sessionFrom(request),
        request.nextUrl.searchParams.get("id") ?? "",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const session = sessionFrom(request);
    const result = await changeCareProposal(
      database(),
      session,
      await jsonBody(request, 65536),
    );
    scheduleInboxAnalysis(session, { kind: "patient" });
    return success(result);
  } catch (error) {
    return failure(error);
  }
}
