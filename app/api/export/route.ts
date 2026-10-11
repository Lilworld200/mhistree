import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import { exportPage } from "@/features/patient/account/export";
import { sessionFrom, failure } from "@/lib/http";
export async function GET(request: NextRequest) {
  try {
    const pool = database(),
      session = sessionFrom(request);
    const snapshot = new Date().toISOString();
    let page = await exportPage(pool, session, null, snapshot);
    let first = true,
      started = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          if (!started) {
            controller.enqueue(
              encoder.encode(
                '{"format":"mhistree-patient-records-v1","records":[',
              ),
            );
            started = true;
          }
          for (const item of page.items) {
            controller.enqueue(
              encoder.encode(`${first ? "" : ","}${JSON.stringify(item)}`),
            );
            first = false;
          }
          if (!page.nextCursor) {
            controller.enqueue(encoder.encode("]}"));
            controller.close();
            return;
          }
          page = await exportPage(pool, session, page.nextCursor, snapshot);
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition":
          'attachment; filename="mhistree-record-export.json"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
