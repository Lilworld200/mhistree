import "server-only";
import type { AccessTransaction } from "@/features/access/server";
import { digest } from "@/features/auth/sessions";
import {
  recordNarrative,
  type NarrativeBody,
} from "@/features/health-records/narrative";
import type { z } from "zod";
import type { eventTime } from "@/features/health-records/schema";

export type PriorReport = {
  id: string;
  logicalId: string;
  version: number;
  category: string;
  body: NarrativeBody & { bodySite: string | null; contextLinks: string[] };
  eventTime: z.infer<typeof eventTime>;
  capturedAt: string;
  quote: string;
};
export type ExtractionContext = {
  reports: PriorReport[];
  messages: { content: string; capturedAt: string; timezone: string }[];
  fingerprint: string;
};

/** Patient evidence only, same author/person/conversation, before the target message.
 * Reconstruct the latest pre-message version so this job's own retained revisions
 * cannot change its retry context. Model calls never hold a database transaction.
 */
export async function extractionContext(
  a: AccessTransaction,
  messageId: string,
): Promise<ExtractionContext> {
  const reports = (
    await a.tx.query(
      `with prior as (
      select distinct on(e.logical_id) e.*,s.captured_at,m.sequence
      from mhistree.contributions e
      join mhistree.sources s on s.id=e.source_id
      join mhistree.chat_messages m on m.id=s.chat_message_id
      join mhistree.chat_messages target on target.id=$1
      where m.conversation_id=target.conversation_id and m.sequence<target.sequence
        and e.author_account_id=$2 and e.patient_person_id=target.person_id
        and e.source_status='patient-reported' and e.visibility='finalized'
      order by e.logical_id,e.version desc
    ) select * from prior order by sequence desc,id desc limit 12`,
      [messageId, a.actor.accountId],
    )
  ).rows;
  const messages = (
    await a.tx.query(
      `select m.content,m.captured_at,m.timezone from mhistree.chat_messages m
     join mhistree.chat_messages target on target.id=$1
     where m.conversation_id=target.conversation_id and m.sequence<target.sequence
       and m.role='patient' and m.account_id=$2 and m.person_id=target.person_id
     order by m.sequence desc limit 8`,
      [messageId, a.actor.accountId],
    )
  ).rows;
  return {
    reports: reports.map((e) => ({
      id: e.id,
      logicalId: e.logical_id,
      version: e.version,
      category: e.category,
      body: e.body,
      eventTime: e.occurred_at,
      capturedAt: e.captured_at.toISOString(),
      quote: e.source_spans.join("; ").slice(0, 500),
    })),
    messages: messages.reverse().map((m) => ({
      content: m.content.slice(0, 1000),
      capturedAt: m.captured_at.toISOString(),
      timezone: m.timezone,
    })),
    fingerprint: digest(JSON.stringify(reports.map((e) => [e.id, e.version]))),
  };
}

export function modelExtractionContext(context: ExtractionContext | undefined) {
  if (!context) return null;
  const projection = {
    previousPatientMessages: [...context.messages],
    previousReports: context.reports.map((r) => ({
      eventId: r.id,
      category: r.category,
      text: (r.body.reportStyle
        ? r.body.text
        : recordNarrative({
            body: r.body,
            source_status: "patient-reported",
            source_spans: [r.quote],
          })
      ).slice(0, 600),
      subject: "patient",
      reportStyle: r.body.reportStyle ?? "legacy",
      eventTime: r.eventTime,
      capturedAt: r.capturedAt,
      quote: r.quote,
    })),
    bounded: true,
  };
  // Keep a valid structured payload within an explicit character budget. Remove
  // oldest context, never trim a JSON string into malformed or misleading data.
  while (JSON.stringify(projection).length > 16000) {
    if (projection.previousPatientMessages.length)
      projection.previousPatientMessages.shift();
    else projection.previousReports.pop();
  }
  return projection;
}

/** Different reported dates cannot be merged merely because the topic matches. */
export function compatibleTimes(
  a: PriorReport["eventTime"],
  b: PriorReport["eventTime"],
) {
  if (a.precision === "unknown" || b.precision === "unknown") return true;
  const bounds = (
    v: Exclude<PriorReport["eventTime"], { precision: "unknown" }>,
  ) =>
    v.precision === "exact"
      ? [Date.parse(v.at), Date.parse(v.at)]
      : [Date.parse(v.from), Date.parse(v.to)];
  const [af, at] = bounds(a),
    [bf, bt] = bounds(b);
  // Day ranges are half open: adjacent days are distinct, including midnight.
  if (af === at && bf === bt) return af === bf;
  if (af === at) return bf <= af && af < bt;
  if (bf === bt) return af <= bf && bf < at;
  return af < bt && bf < at;
}

/** An explicit reference to an identified earlier incident is not a new date. */
export function incidentTimeReference(phrase: string) {
  return /^(?:(?:on|during|at|in)\s+)?(?:that|the|this)\s+(?:same|earlier|previous|reported)\s+(?:run|jog|walk|workout|session|incident|episode|occasion|event|time)\.?$/i.test(
    phrase.trim(),
  );
}
