import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { aiGateway } from "@/lib/ai/gateway";
import { actingContextSchema, withAccess } from "@/features/access/server";
import { withdrawRecommendation } from "@/features/clinical-care/medication-recommendations";
import { inboxConnections, acknowledgeInbox } from "@/features/messaging/inbox";
import { careMessages, sendCareMessage } from "@/features/messaging/server";
import {
  inboxAnalysisStatus,
  openInboxFindings,
  processInboxAnalysis,
} from "@/features/messaging/analysis";
import { scheduleInboxAnalysis } from "@/features/messaging/schedule-analysis";
import {
  success,
  failure,
  mutationGuard,
  jsonBody,
  sessionFrom,
} from "@/lib/http";
export const maxDuration = 240;
export async function GET(r: NextRequest) {
  try {
    const session = sessionFrom(r),
      pool = database(),
      connection = r.nextUrl.searchParams.get("connection");
    if (!connection)
      return success(
        await inboxConnections(
          pool,
          session,
          r.nextUrl.searchParams.get("practitioner") === "1",
        ),
      );
    z.uuid().parse(connection);
    const context = actingContextSchema.parse(
      JSON.parse(r.nextUrl.searchParams.get("context") ?? '{"kind":"patient"}'),
    );
    const analysis = await inboxAnalysisStatus(
      pool,
      session,
      context,
      connection,
    );
    scheduleInboxAnalysis(session, context, connection);
    if (r.nextUrl.searchParams.get("view") === "analysis")
      return success(analysis);
    const messages = await careMessages(
      pool,
      session,
      context,
      connection,
      r.nextUrl.searchParams.get("before") ?? undefined,
    );
    return success({ ...messages, analysis });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    const d = z
      .object({
        connectionId: z.uuid(),
        context: actingContextSchema,
        action: z.enum(["send", "read", "analyze", "finding", "withdraw"]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r, 50000));
    const pool = database(),
      session = sessionFrom(r);
    if (d.action === "withdraw") {
      const item = z
        .object({ id: z.uuid(), version: z.number().int().positive() })
        .strict()
        .parse(d.data);
      return success(
        await withAccess(pool, session, d.context, (a) =>
          withdrawRecommendation(a, item.id, item.version),
        ),
      );
    }
    if (d.action === "read")
      return success(
        await acknowledgeInbox(
          pool,
          session,
          d.context,
          d.connectionId,
          z.object({ throughSequence: z.string() }).strict().parse(d.data)
            .throughSequence,
        ),
      );
    if (d.action === "finding")
      return success(await openInboxFindings(pool, session, d.context, d.data));
    if (d.action === "analyze")
      return success(
        await processInboxAnalysis(
          pool,
          session,
          d.context,
          d.connectionId,
          aiGateway(),
          z.object({ id: z.uuid() }).strict().parse(d.data).id,
        ),
      );
    const result = await sendCareMessage(pool, session, d.context, {
      ...z.record(z.string(), z.unknown()).parse(d.data),
      connectionId: d.connectionId,
    });
    scheduleInboxAnalysis(session, d.context, d.connectionId);
    return success(result);
  } catch (e) {
    return failure(e);
  }
}
