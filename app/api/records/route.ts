import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import { sessionFrom, success, failure } from "@/lib/http";
import {
  timeline,
  sourcePreview,
  recordVersions,
} from "@/features/health-records/timeline";
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams;
    const pool = database(),
      session = sessionFrom(request);
    if (q.has("sourceId"))
      return success(
        await sourcePreview(
          pool,
          session,
          { kind: "patient" },
          q.get("sourceId")!,
        ),
      );
    if (q.has("versions"))
      return success(await recordVersions(pool, session, q.get("versions")!));
    return success(
      await timeline(
        pool,
        session,
        { kind: "patient" },
        {
          ...(q.get("category") ? { category: q.get("category") } : {}),
          ...(q.get("source") ? { source: q.get("source") } : {}),
          ...(q.get("cursor") ? { cursor: q.get("cursor") } : {}),
        },
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
