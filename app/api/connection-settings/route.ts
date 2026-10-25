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
  approvalRole,
  connectionApprovalSettings,
  saveConnectionApprovalSettings,
} from "@/features/access/approval-settings";
export async function GET(r: NextRequest) {
  try {
    return success(
      await connectionApprovalSettings(
        database(),
        sessionFrom(r),
        approvalRole.parse(r.nextUrl.searchParams.get("role")),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    return success(
      await saveConnectionApprovalSettings(
        database(),
        sessionFrom(r),
        await jsonBody(r),
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
