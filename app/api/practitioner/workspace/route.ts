import { NextRequest } from "next/server";
import { z } from "zod";
import { database } from "@/lib/db/client";
import {
  directWorkspace,
  directTimeline,
  workspaceView,
} from "@/features/practitioner/workspace";
import { saveWork, editWork } from "@/features/clinical-care/work";
import { finalizeEntry } from "@/features/clinical-care/entries";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import {
  createServiceRequest,
  changeServiceRequest,
  publishResult,
} from "@/features/clinical-care/requests";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { sendCareMessage } from "@/features/messaging/server";
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
      session = sessionFrom(r);
    if (r.nextUrl.searchParams.get("view") === "timeline")
      return success(
        await directTimeline(pool, session, connectionId, {
          ...(r.nextUrl.searchParams.get("category")
            ? { category: r.nextUrl.searchParams.get("category") }
            : {}),
          ...(r.nextUrl.searchParams.get("cursor")
            ? { cursor: r.nextUrl.searchParams.get("cursor") }
            : {}),
        }),
      );
    return success(
      await directWorkspace(
        pool,
        session,
        connectionId,
        workspaceView.parse(r.nextUrl.searchParams.get("view") ?? "all"),
      ),
    );
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
    if (d.action === "read") {
      const read = z
        .object({
          throughSequence: z
            .string()
            .regex(/^\d{1,18}$/)
            .optional(),
        })
        .strict()
        .parse(d.data ?? {});
      return success(
        await markThreadRead(
          pool,
          session,
          d.connectionId,
          undefined,
          read.throughSequence,
        ),
      );
    }
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
