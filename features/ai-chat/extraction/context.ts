import "server-only";
import type { AccessTransaction } from "@/features/access/server";
import { digest } from "@/features/auth/sessions";
import {
  recordNarrative,
  type NarrativeBody,
} from "@/features/health-records/narrative";
import type { z } from "zod";
import type { eventTime } from "@/features/health-records/schema";
import { searchTimelineInAccess } from "../timeline-search";
import { episodeStates } from "@/features/health-records/episode-state";

export type PriorReport = {
  id: string;
  logicalId: string;
  version: number;
  category: string;
  status: string;
  body: NarrativeBody & { bodySite: string | null; contextLinks: string[] };
  eventTime: z.infer<typeof eventTime>;
  capturedAt: string;
  quote: string;
};
export type ExtractionContext = {
  reports: PriorReport[];
  messages: { content: string; capturedAt: string; timezone: string }[];
  fingerprint: string;
  precedingQuestion?: {
    messageId?: string;
    content: string;
    kind: string;
    subject: string;
    capturedAt: string;
  } | null;
  timelineCandidates?: {
    eventId: string;
    text: string;
    eventTime: unknown;
    capturedAt: string;
    sourceStatus: string;
    status: string;
  }[];
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
  const target = (
    await a.tx.query(
      "select content,captured_at,person_id from mhistree.chat_messages where id=$1 and role='patient'",
      [messageId],
    )
  ).rows[0];
  const preceding = (
    await a.tx.query(
      `select m.id,m.role,m.content,m.dialogue,m.captured_at from mhistree.chat_messages m
     join mhistree.chat_messages target on target.id=$1
     where m.conversation_id=target.conversation_id and m.sequence<target.sequence
     order by m.sequence desc limit 1`,
      [messageId],
    )
  ).rows[0];
  const precedingQuestion: ExtractionContext["precedingQuestion"] =
    preceding?.role === "assistant" && preceding.dialogue?.question
      ? {
          messageId: preceding.id,
          content: preceding.content.slice(0, 1000),
          kind: preceding.dialogue.question.kind,
          subject: preceding.dialogue.question.subject,
          capturedAt: preceding.captured_at.toISOString(),
        }
      : null;
  const candidates = target
    ? await searchTimelineInAccess(
        a,
        target.person_id,
        precedingQuestion?.kind === "symptom"
          ? `${precedingQuestion.subject} ${target.content}`.slice(0, 10000)
          : target.content,
        target.captured_at,
      )
    : [];
  // A new-chat short answer may refer to an older report only when the exact
  // preceding symptom subject identifies one currently authorized episode.
  // Search similarity alone never promotes wider history to a mutation target.
  if (
    precedingQuestion?.kind === "symptom" &&
    /^(?:no|nope|yes|yeah|yep)[.!\s]*$/i.test(target?.content ?? "")
  ) {
    const words =
      precedingQuestion.subject.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    const own = candidates.filter(
      (e) =>
        e.category === "symptom" &&
        e.author_account_id === a.actor.accountId &&
        e.source_status === "patient-reported" &&
        e.chat_message_id &&
        words.length &&
        words.every((word) =>
          `${e.body.text} ${e.body.bodySite ?? ""}`
            .toLowerCase()
            .includes(word),
        ),
    );
    const updated = await episodeStates(
      a,
      own.map((e) => e.id),
    );
    const current = own.filter(
      (e) => !updated.some((state) => state.root === e.id),
    );
    if (
      current.length === 1 &&
      candidates.filter((e) => e.match_score > 0).length < 16 &&
      !reports.some((r) => r.id === current[0].id)
    )
      reports.unshift(current[0]);
  }
  const timelineCandidates = candidates
    .filter((e) => e.match_score > 0 && !reports.some((r) => r.id === e.id))
    .slice(0, 4)
    .map((e) => ({
      eventId: e.id,
      text: recordNarrative(e).slice(0, 600),
      eventTime: e.occurred_at,
      capturedAt: e.captured_at.toISOString(),
      sourceStatus: e.source_status,
      status: e.status,
    }));
  return {
    precedingQuestion,
    timelineCandidates,
    reports: reports.map((e) => ({
      id: e.id,
      logicalId: e.logical_id,
      version: e.version,
      category: e.category,
      status: e.status,
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
    fingerprint: digest(
      JSON.stringify([
        reports.map((e) => [e.id, e.version]),
        precedingQuestion,
      ]),
    ),
  };
}

export function modelExtractionContext(context: ExtractionContext | undefined) {
  if (!context) return null;
  const projection = {
    precedingQuestion: context.precedingQuestion ?? null,
    previousPatientMessages: context.messages.slice(-4),
    possibleTimelineContext: (context.timelineCandidates ?? []).slice(0, 4),
    previousReports: context.reports.slice(0, 6).map((r) => ({
      eventId: r.id,
      category: r.category,
      status: r.status,
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
  while (JSON.stringify(projection).length > 6000) {
    if (projection.previousPatientMessages.length)
      projection.previousPatientMessages.shift();
    else if (projection.possibleTimelineContext.length)
      projection.possibleTimelineContext.pop();
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
  return /^(?:(?:on|during|at|in)\s+)?(?:that|the|this)\s+(?:same|earlier|previous|reported)\s+(?:run|jog|walk|workout|session|incident|episode|occasion|event|time|(?:(?:sleepless|restless|difficult|painful)\s+)?(?:night|morning|afternoon|evening|day|week|month))\.?$/i.test(
    phrase.trim(),
  );
}
