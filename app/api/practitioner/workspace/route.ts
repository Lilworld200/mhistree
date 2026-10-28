import { scheduleInboxAnalysis } from "@/features/messaging/schedule-analysis";
import {
  practitionerChatHistory,
  preparePractitionerReview,
  confirmPractitionerReview,
} from "@/features/clinical-care/practitioner-chat";
import {
  saveCareNote,
  privateNotes,
} from "@/features/clinical-care/care-notes";
import { withdrawRecommendation } from "@/features/clinical-care/medication-recommendations";
import { withAccess } from "@/features/access/server";
import { practitionerPresence } from "@/features/messaging/connected-chat";
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
export const maxDuration = 240;
export async function GET(r: NextRequest) {
  try {
    const connectionId = z
      .uuid()
      .parse(r.nextUrl.searchParams.get("connection"));
    const pool = database(),
      session = sessionFrom(r);
    if (r.nextUrl.searchParams.get("view") === "ai-chat")
      return success(
        await practitionerChatHistory(
          pool,
          session,
          { kind: "direct", connectionId },
          r.nextUrl.searchParams.get("cursor") ?? undefined,
        ),
      );
    if (r.nextUrl.searchParams.get("view") === "private-notes")
      return success(
        await privateNotes(
          pool,
          session,
          { kind: "direct", connectionId },
          r.nextUrl.searchParams.get("cursor") ?? undefined,
        ),
      );
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
          "save-note",
          "edit",
          "finalize",
          "request",
          "request-transition",
          "result",
          "ai",
          "ai-save",
          "ai-review",
          "ai-review-confirm",
          "message",
          "appointment",
          "appointment-create",
          "read",
          "presence",
          "recommendation-withdraw",
        ]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r, 50000));
    const pool = database(),
      session = sessionFrom(r),
      context = { kind: "direct" as const, connectionId: d.connectionId };
    if (d.action === "ai-review")
      return success(
        await preparePractitionerReview(pool, session, context, d.data),
      );
    if (d.action === "ai-review-confirm")
      return success(
        await confirmPractitionerReview(pool, session, context, d.data),
      );
    if (d.action === "recommendation-withdraw") {
      const data = z
        .object({ id: z.uuid(), version: z.number().int().positive() })
        .strict()
        .parse(d.data);
      return success(
        await withAccess(pool, session, context, (a) =>
          withdrawRecommendation(a, data.id, data.version),
        ),
      );
    }
    if (d.action === "presence")
      return success(
        await practitionerPresence(pool, session, context, d.connectionId),
      );
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
          originCareMessageId: z.uuid().optional(),
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
    const result = await {
      save: saveWork,
      "save-note": saveCareNote,
      edit: editWork,
      finalize: finalizeEntry,
      "ai-save": savePractitionerProposal,
      request: createServiceRequest,
      "request-transition": changeServiceRequest,
      result: publishResult,
      message: sendCareMessage,
      appointment: changeAppointment,
      "appointment-create": createPractitionerAppointment,
    }[d.action](pool, session, context, d.data);
    if (d.action === "message")
      scheduleInboxAnalysis(session, context, d.connectionId);
    return success(result);
  } catch (e) {
    return failure(e);
  }
}
