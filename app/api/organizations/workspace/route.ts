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
import { practitionerPresence } from "@/features/messaging/connected-chat";
import { NextRequest } from "next/server";
import { z } from "zod";
import { actingContextSchema, withAccess } from "@/features/access/server";
import { database } from "@/lib/db/client";
import { organizationWorkspace } from "@/features/organizations/care";
import { saveWork, editWork } from "@/features/clinical-care/work";
import { finalizeEntry } from "@/features/clinical-care/entries";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import {
  createServiceRequest,
  changeServiceRequest,
  publishResult,
  requestList,
} from "@/features/clinical-care/requests";
import { careMessages, sendCareMessage } from "@/features/messaging/server";
import { changeAppointment } from "@/features/appointments/server";
import { markThreadRead } from "@/features/practitioner/daily";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { aiGateway } from "@/lib/ai/gateway";
import { DomainError } from "@/lib/errors";
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
    const context = actingContextSchema.parse(
      JSON.parse(r.nextUrl.searchParams.get("context") ?? "null"),
    );
    const pool = database(),
      session = sessionFrom(r);
    if (r.nextUrl.searchParams.get("view") === "ai-chat")
      return success(
        await practitionerChatHistory(
          pool,
          session,
          context,
          r.nextUrl.searchParams.get("cursor") ?? undefined,
        ),
      );
    if (r.nextUrl.searchParams.get("view") === "private-notes")
      return success(
        await privateNotes(
          pool,
          session,
          context,
          r.nextUrl.searchParams.get("cursor") ?? undefined,
        ),
      );
    const data = await organizationWorkspace(pool, session, context);
    if (context.kind !== "organization")
      return success({ ...data, requests: [], messages: null });
    const canMessage = await withAccess(
      pool,
      session,
      context,
      async (a) =>
        (
          await a.tx.query(
            "select mhistree.can_participate($1,'messages.send') allowed",
            [context.connectionId],
          )
        ).rows[0].allowed,
    );
    return success({
      ...data,
      requests: await requestList(pool, session, context),
      messages: canMessage
        ? await careMessages(pool, session, context, context.connectionId)
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
        context: actingContextSchema,
        action: z.enum([
          "save",
          "save-note",
          "edit",
          "finalize",
          "request",
          "request-transition",
          "result",
          "message",
          "appointment",
          "read",
          "presence",
          "recommendation-withdraw",
          "ai",
          "ai-save",
          "ai-review",
          "ai-review-confirm",
        ]),
        data: z.unknown(),
      })
      .strict()
      .parse(await jsonBody(r, 50000));
    if (d.context.kind !== "organization" && d.context.kind !== "initial-care")
      throw new DomainError("ACCESS_DENIED");
    const pool = database(),
      session = sessionFrom(r);
    if (d.action === "ai-review")
      return success(
        await preparePractitionerReview(pool, session, d.context, d.data),
      );
    if (d.action === "ai-review-confirm")
      return success(
        await confirmPractitionerReview(pool, session, d.context, d.data),
      );
    if (d.action === "recommendation-withdraw") {
      const data = z
        .object({ id: z.uuid(), version: z.number().int().positive() })
        .strict()
        .parse(d.data);
      return success(
        await withAccess(pool, session, d.context, (a) =>
          withdrawRecommendation(a, data.id, data.version),
        ),
      );
    }
    if (d.action === "presence") {
      if (d.context.kind !== "organization")
        throw new DomainError("ACCESS_DENIED");
      return success(
        await practitionerPresence(
          pool,
          session,
          d.context,
          d.context.connectionId,
        ),
      );
    }
    if (d.action === "ai" || d.action === "read") {
      if (d.context.kind !== "organization")
        throw new DomainError("ACCESS_DENIED");
      if (d.action === "read")
        return success(
          await markThreadRead(
            pool,
            session,
            d.context.connectionId,
            d.context,
          ),
        );
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
          { ...data, connectionId: d.context.connectionId },
          aiGateway(),
          d.context,
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
    }[d.action](pool, session, d.context, d.data);
    if (d.action === "message" && d.context.kind === "organization")
      scheduleInboxAnalysis(session, d.context, d.context.connectionId);
    return success(result);
  } catch (e) {
    return failure(e);
  }
}
