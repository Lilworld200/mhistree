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
    return success(
      await changeCareProposal(
        database(),
        sessionFrom(request),
        await jsonBody(request, 65536),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
