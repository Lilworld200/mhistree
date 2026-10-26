import { timeline } from "@/features/health-records/timeline";
import { NextRequest } from "next/server";
import { withAccess } from "@/features/access/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import { directWorkspace } from "@/features/practitioner/workspace";
import { saveWork, editWork } from "@/features/clinical-care/work";
import { finalizeEntry } from "@/features/clinical-care/entries";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import {
  createServiceRequest,
  changeServiceRequest,
  publishResult,
  requestList,
} from "@/features/clinical-care/requests";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { careMessages, sendCareMessage } from "@/features/messaging/server";
import {
  changeAppointment,
  createPractitionerAppointment,
} from "@/features/appointments/server";
import { markThreadRead } from "@/features/practitioner/daily";
import { aiGateway } from "@/lib/ai/gateway";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    const connectionId = z
      .uuid()
      .parse(r.nextUrl.searchParams.get("connection"));
    const pool = database(),
      session = sessionFrom(r),
      context = { kind: "direct" as const, connectionId };
    const data = await directWorkspace(pool, session, connectionId);
    if (r.nextUrl.searchParams.get("view") === "timeline")
      return success(
        await timeline(pool, session, context, {
          ...(r.nextUrl.searchParams.get("category")
            ? { category: r.nextUrl.searchParams.get("category") }
            : {}),
          ...(r.nextUrl.searchParams.get("cursor")
            ? { cursor: r.nextUrl.searchParams.get("cursor") }
            : {}),
        }),
      );
    const canMessage = await withAccess(
      pool,
      session,
      context,
      async (a) =>
        (
          await a.tx.query(
            "select mhistree.can_participate($1,'messages.send') allowed",
            [connectionId],
          )
        ).rows[0].allowed as boolean,
    );
    return success({
      ...data,
      requests: await requestList(pool, session, context),
      messages: canMessage
        ? await careMessages(pool, session, context, connectionId)
        : null,
    });
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
        action: z.enum([
          "save",
          "edit",
          "finalize",
          "request",
          "request-transition",
          "result",
          "ai",
          "ai-save",
          "message",
          "appointment",
          "appointment-create",
          "read",
        ]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r, 50000));
    const pool = database(),
      session = sessionFrom(r),
      context = { kind: "direct" as const, connectionId: d.connectionId };
    if (d.action === "read")
      return success(await markThreadRead(pool, session, d.connectionId));
    if (d.action === "ai") {
      const data = z
        .object({
          question: z.string(),
          purpose: z.enum(["summary", "question", "assessment", "draft"]),
          includeOwnNotes: z.boolean(),
          conversation: z.boolean().optional(),
          previousRunId: z.uuid().optional(),
          timezone: z.string().optional(),
        })
        .strict()
        .parse(d.data);
      return success(
        await practitionerAssistance(
          pool,
          session,
          { ...data, connectionId: d.connectionId },
          aiGateway(),
        ),
      );
    }
    return success(
      await {
        save: saveWork,
        edit: editWork,
        finalize: finalizeEntry,
        "ai-save": savePractitionerProposal,
        request: createServiceRequest,
        "request-transition": changeServiceRequest,
        result: publishResult,
        message: sendCareMessage,
        appointment: changeAppointment,
        "appointment-create": createPractitionerAppointment,
      }[d.action](pool, session, context, d.data),
    );
  } catch (e) {
    return failure(e);
  }
}
