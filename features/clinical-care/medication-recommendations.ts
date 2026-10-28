import "server-only";
import { z } from "zod";
import { resolveTime } from "@/features/ai-chat/extraction/time";
import { randomUUID } from "node:crypto";
import { authorize, type AccessTransaction } from "@/features/access/server";
import {
  recordSourceInAccess,
  acceptContributionInAccess,
} from "@/features/health-records/server";
import { DomainError } from "@/lib/errors";
export type Recommendation = {
  id: string;
  name: string;
  details: string;
  state: string;
  version: number;
  planned_start: string | null;
  latest_event_id: string | null;
  use_state: string | null;
  disposition: string | null;
  followups_closed: boolean;
};
/** Manual forms and reviewed AI proposals share recommendation/use transitions. */
export async function syncReviewedMedication(
  a: AccessTransaction,
  d: {
    patientPersonId: string;
    category: string;
    name?: string;
    text: string;
    eventId: string;
    useStatus?: string;
  },
) {
  if (
    !d.name ||
    (a.context.kind !== "direct" && a.context.kind !== "organization")
  )
    return;
  if (d.category === "prescription")
    await a.tx.query(
      "insert into mhistree.medication_recommendations(patient_person_id,author_account_id,connection_id,source_event_id,name,details) values($1,$2,$3,$4,$5,$6) on conflict(source_event_id,name) do nothing",
      [
        d.patientPersonId,
        a.actor.accountId,
        a.context.connectionId,
        d.eventId,
        d.name,
        d.text.slice(0, 2000),
      ],
    );
  if (
    d.category === "medication-use" &&
    ["taking", "stopped"].includes(d.useStatus ?? "")
  )
    await a.tx.query(
      "update mhistree.medication_recommendations set state=case when disposition is not null then disposition else $4 end,use_state=$4,followups_closed=true,latest_event_id=$5,version=version+1 where patient_person_id=$1 and connection_id=$2 and lower(name)=lower($3) and latest_event_id is distinct from $5",
      [
        d.patientPersonId,
        a.context.connectionId,
        d.name,
        d.useStatus,
        d.eventId,
      ],
    );
}
export function localDay(now: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export async function pendingRecommendations(
  a: AccessTransaction,
  timezone: string,
  now = new Date(),
) {
  const day = localDay(now, timezone);
  const rows: Recommendation[] = (
    await a.tx.query(
      `select id,name,details,state,version,planned_start::text,latest_event_id,use_state,disposition,followups_closed from mhistree.medication_recommendations where patient_person_id=$1 and state in ('pending','planned') and not followups_closed order by id limit 8`,
      [a.actor.personId],
    )
  ).rows;
  const followed = new Set(
    (
      await a.tx.query(
        "select distinct lower(trim(r.name)) name from mhistree.medication_followups f join mhistree.medication_recommendations r on r.id=f.recommendation_id where f.local_date=$1::date and r.patient_person_id=$2",
        [day, a.actor.personId],
      )
    ).rows.map((r) => r.name),
  );
  return {
    items: rows,
    due: rows.filter(
      (r) =>
        !followed.has(r.name.trim().toLowerCase()) &&
        (!r.planned_start || r.planned_start <= day),
    ),
    day,
  };
}
export function medicationQuestion(r: Recommendation) {
  return r.planned_start
    ? `Have you started taking ${r.name}?`
    : `When, if at all, do you plan to start ${r.name}?`;
}
/** Deliberately narrow. A bare yes never means actual use without the exact preceding question. */
export function medicationStatement(
  text: string,
  name: string,
  question?: string,
) {
  // Normalize typography only for interpretation; the original message stays intact.
  text = text.replace(/[’‘]/g, "'");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const named = new RegExp(`\\b${escaped}\\b`, "i").test(text);
  const exact =
    question === `Have you started taking ${name}?` ||
    question === `When, if at all, do you plan to start ${name}?`;
  if (!named && !exact) return null;
  if (
    text.includes("?") ||
    /\b(?:unsure|uncertain|not sure|never|did not|didn.t)\b/i.test(text)
  )
    return null;
  if (/\b(?:maybe|might|should|could|would|if|can i|shall i)\b/i.test(text))
    return null;
  const target = named ? escaped : "(?:it|that medicine|this medicine)";
  const matches = (pattern: string) =>
    new RegExp(`^\\s*(?:${pattern})\\s+${target}\\b`, "i").test(text);
  if (matches("i (?:(?:have )?stopped taking|am no longer taking)"))
    return "stopped" as const;
  if (
    matches("i (?:won't|will not|don't want to) (?:start(?: taking)?|take)") ||
    (exact &&
      /^(?:no thanks|no thank you|not going to start)[.!]?$/i.test(text.trim()))
  )
    return "declined" as const;
  if (
    matches("i(?:'m| am) (?:now )?taking|i (?:have )?started taking|i take") ||
    (question === `Have you started taking ${name}?` &&
      /^yes[.!]?$/i.test(text.trim()))
  )
    return "taking" as const;
  if (
    matches(
      "(?:i(?:'ll| will)|i plan to|i intend to|i am going to) (?:start(?: taking)?|take)",
    ) ||
    (question === `When, if at all, do you plan to start ${name}?` &&
      /^(?:today|tomorrow|\d{4}-\d{2}-\d{2})[.!]?$/i.test(text.trim()))
  )
    return "planned" as const;
  return null;
}
export async function captureMedicationCommitment(
  a: AccessTransaction,
  message: {
    id: string;
    conversationId?: string;
    threadId?: string;
    source?: "care";
    content: string;
    timezone: string;
  },
) {
  const care = message.source === "care";
  if (
    a.context.kind !== "patient" ||
    (care ? !message.threadId : !message.conversationId)
  )
    throw new DomainError("ACCESS_DENIED");
  const previous = (
    await a.tx.query(
      care
        ? "select id,content,author_account_id from mhistree.care_messages where thread_id=$1 and sequence<(select sequence from mhistree.care_messages where id=$2) order by sequence desc limit 1"
        : "select id,content from mhistree.chat_messages where conversation_id=$1 and sequence<(select sequence from mhistree.chat_messages where id=$2) order by sequence desc limit 1",
      [care ? message.threadId : message.conversationId, message.id],
    )
  ).rows[0];
  const followup =
    previous && !care
      ? (
          await a.tx.query(
            "select recommendation_id,question from mhistree.medication_followups where reply_message_id=$1",
            [previous.id],
          )
        ).rows[0]
      : null;
  const displayedCareAnchor = care
    ? (
        await a.tx.query(
          "select reply_to from mhistree.care_messages where id=$1 and author_account_id=$2",
          [message.id, a.actor.accountId],
        )
      ).rows[0]?.reply_to
    : null;
  await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `medication-workflow:${a.actor.personId}`,
  ]);
  const rows: Recommendation[] = (
    await a.tx.query(
      "select id,name,details,state,version,planned_start::text,latest_event_id,use_state,disposition,followups_closed from mhistree.medication_recommendations where patient_person_id=$1 and (state in ('pending','planned','taking') or position(lower(name) in lower($2))>0) order by case when position(lower(name) in lower($2))>0 then 0 else 1 end,id limit 20 for update",
      [a.actor.personId, `${message.content}\n${previous?.content ?? ""}`],
    )
  ).rows;
  function questionFor(r: Recommendation): string | undefined {
    if (care) {
      if (
        !previous ||
        previous.author_account_id === a.actor.accountId ||
        previous.id !== displayedCareAnchor
      )
        return;
      return [
        `Have you started taking ${r.name}?`,
        `When, if at all, do you plan to start ${r.name}?`,
      ].find((q) => q.toLowerCase() === previous.content.trim().toLowerCase());
    }
    return followup?.recommendation_id === r.id &&
      previous?.content.endsWith(followup.question)
      ? followup.question
      : undefined;
  }
  const matches = rows.flatMap((r) => {
    const question = questionFor(r);
    const state = medicationStatement(message.content, r.name, question);
    return state ? [{ r, state }] : [];
  });
  if (
    !matches.length ||
    new Set(matches.map((m) => m.r.name.trim().toLowerCase())).size !== 1 ||
    new Set(matches.map((m) => m.state)).size !== 1
  )
    return false;
  const { r, state } = matches[0];
  const sameMedicine = rows.filter(
    (other) => other.name.trim().toLowerCase() === r.name.trim().toLowerCase(),
  );
  if (
    state === "declined" &&
    sameMedicine.some(
      (other) => other.state === "taking" || other.use_state === "taking",
    )
  )
    return false;
  const captured = (
    await a.tx.query(
      care
        ? "select sent_at captured_at from mhistree.care_messages where id=$1 and author_account_id=$2"
        : "select captured_at from mhistree.chat_messages where id=$1 and account_id=$2",
      [message.id, a.actor.accountId],
    )
  ).rows[0];
  if (!captured) throw new DomainError("ACCESS_DENIED");
  const knownTimezone = message.timezone !== "unknown";
  const day = localDay(
    captured.captured_at,
    knownTimezone ? message.timezone : "UTC",
  );
  let plannedStart = r.planned_start;
  const escapedName = r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const timingSubject = questionFor(r) ? `(?:${escapedName}|it)` : escapedName;
  const timing =
    message.content
      .match(
        new RegExp(
          `${timingSubject}(?:\\s+(?:on|starting|from))?\\s+(today|yesterday|tomorrow|\\d{4}-\\d{2}-\\d{2})\\b`,
          "i",
        ),
      )?.[1]
      ?.toLowerCase() ??
    (/^(?:today|tomorrow|\d{4}-\d{2}-\d{2})[.!]?$/i.test(message.content.trim())
      ? message.content.trim().replace(/[.!]$/, "").toLowerCase()
      : null);
  const supportedDate =
    !knownTimezone && ["today", "yesterday", "tomorrow"].includes(timing ?? "")
      ? null
      : timing === "today"
        ? day
        : timing === "yesterday"
          ? new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
          : timing === "tomorrow"
            ? new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)
            : timing && z.iso.date().safeParse(timing).success
              ? timing
              : null;
  if (
    ["taking", "stopped"].includes(state) &&
    supportedDate &&
    knownTimezone &&
    supportedDate > day
  )
    return false;
  if (state === "planned") plannedStart = supportedDate;
  const explicitStart = /^\s*i (?:have )?started taking\b/i.test(
    message.content,
  );
  const explicitStop = /^\s*i (?:have )?stopped taking\b/i.test(
    message.content,
  );

  const sourceQuote = (
    message.content.trim().match(/^[\s\S]*?(?:[.!?](?=\s|$)|$)/)?.[0] ??
    message.content.trim()
  ).slice(0, 500);
  let eventId = r.latest_event_id;
  {
    const source = await recordSourceInAccess(a, {
      patientPersonId: a.actor.personId,
      category: "medication-use",
      sourceTimezone: message.timezone,
      content: message.content,
      clientKey: message.id,
      ...(care ? { careMessageId: message.id } : { messageId: message.id }),
    });
    const result = await acceptContributionInAccess(a, {
      sourceId: source.sourceId,
      sourceVersion: source.version,
      sourceItemId: `recommendation:${r.id}`,
      operationKey: randomUUID(),
      body: {
        text: `${r.name}: ${sourceQuote}`,
        bodySite: null,
        contextLinks: [
          ...new Set(
            sameMedicine.flatMap((other) =>
              other.latest_event_id ? [other.latest_event_id] : [],
            ),
          ),
        ],
        medication: {
          recommendationId: r.id,
          commitment: state === "planned",
          useStatus:
            state === "planned" || state === "declined" ? "not-started" : state,
          plannedStart,
          plannedEnd: null,
          actualStart:
            state === "taking" && explicitStart ? supportedDate : null,
          actualEnd: state === "stopped" && explicitStop ? supportedDate : null,
        },
      },
      occurredAt:
        state !== "planned" && supportedDate && knownTimezone
          ? resolveTime(supportedDate, captured.captured_at, message.timezone)
          : { precision: "unknown" },
      status: state === "stopped" ? "resolved" : "active",
      sourceSpans: [sourceQuote],
    });
    eventId = result.eventId;
  }
  await a.tx.query(
    "update mhistree.medication_recommendations set state=case when disposition is not null then disposition else $2 end,planned_start=$3,commitment_message_id=$4,latest_event_id=$5,commitment_care_message_id=$6,use_state=$7,disposition=case when $2='declined' then coalesce(disposition,'declined') else disposition end,followups_closed=followups_closed or $2 in ('taking','stopped','declined'),version=version+1 where id=any($1::uuid[])",
    [
      sameMedicine.map((other) => other.id),
      state,
      plannedStart,
      care ? null : message.id,
      eventId,
      care ? message.id : null,
      state === "declined" ? "not-started" : state,
    ],
  );
  await a.tx.query(
    "insert into mhistree.medication_commitments(message_id,recommendation_id,event_id,chat_message_id,care_message_id,question_care_message_id) values($1,$2,$3,$4,$5,$6)",
    [
      message.id,
      r.id,
      eventId,
      care ? null : message.id,
      care ? message.id : null,
      care && questionFor(r) ? previous.id : null,
    ],
  );
  return true;
}
export async function dismissRecommendation(
  a: AccessTransaction,
  id: string,
  version: number,
) {
  await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `medication-workflow:${a.actor.personId}`,
  ]);
  const changed = await a.tx.query(
    "update mhistree.medication_recommendations set state='dismissed',disposition='dismissed',followups_closed=true,version=version+1 where id=$1 and version=$2 and patient_person_id=$3 and state in ('pending','planned') returning id",
    [id, version, a.actor.personId],
  );
  if (!changed.rowCount) throw new DomainError("VERSION_CONFLICT");
  return { dismissed: true };
}

/** Withdraws initiation follow-ups; sent text, prescriptions and actual-use history remain. */
export async function withdrawRecommendation(
  a: AccessTransaction,
  id: string,
  version: number,
) {
  if (a.context.kind !== "direct" && a.context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");
  const patient = (
    await a.tx.query(
      "select patient_person_id from mhistree.medication_recommendations where id=$1 and author_account_id=$2",
      [id, a.actor.accountId],
    )
  ).rows[0];
  if (!patient) throw new DomainError("ACCESS_DENIED");
  await authorize(
    a,
    {
      patientPersonId: patient.patient_person_id,
      originPersonId: patient.patient_person_id,
      category: "prescription",
      visibility: "finalized",
      authorAccountId: a.actor.accountId,
      originalContext: a.contextId,
      originalOrganizationId:
        a.context.kind === "organization" ? a.context.organizationId : null,
    },
    "write",
  );
  await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `medication-workflow:${patient.patient_person_id}`,
  ]);
  const result = await a.tx.query(
    "update mhistree.medication_recommendations set state='withdrawn',disposition='withdrawn',followups_closed=true,version=version+1 where id=$1 and version=$2 and author_account_id=$3 and connection_id=$4 and state in ('pending','planned') returning id",
    [id, version, a.actor.accountId, a.context.connectionId],
  );
  if (!result.rowCount) throw new DomainError("VERSION_CONFLICT");
  return { withdrawn: true };
}
