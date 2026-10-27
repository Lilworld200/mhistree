import "server-only";
import { z } from "zod";
import {
  withAccess,
  type AccessTransaction,
  type ActingContext,
} from "@/features/access/server";
import type { Pool } from "pg";
import { aiDebug } from "@/lib/ai/debug";

// Search vocabulary only: a match never establishes a diagnosis, cause or episode.
const concepts = {
  stress: [
    "stress",
    "stressed",
    "stressful",
    "anxiety",
    "anxious",
    "overwhelmed",
  ],
  abdomen: ["belly", "stomach", "stomachache", "tummy", "abdomen", "abdominal"],
  lowerLimb: [
    "leg",
    "legs",
    "knee",
    "knees",
    "ankle",
    "ankles",
    "foot",
    "feet",
    "calf",
    "calves",
    "thigh",
    "thighs",
  ],
  exercise: [
    "jog",
    "jogging",
    "jogged",
    "run",
    "running",
    "ran",
    "walk",
    "walking",
    "walked",
    "hike",
    "hiking",
    "workout",
    "exercise",
    "cycling",
  ],
  head: ["head", "headache", "headaches", "migraine"],
  breathing: ["breath", "breathing", "breathless", "wheeze", "wheezing"],
  fatigue: ["tired", "tiredness", "fatigue", "exhausted", "exhaustion"],
  sleep: ["sleep", "sleeping", "slept", "insomnia", "sleepless"],
} as const;
const stopWords = new Set(
  "the and that this with from have having been getting about would could should there their them they what when where which your yours reported patient says said feeling feel better worse today yesterday morning evening now still again really very just much some also because into went was were are for but not my me im its it is am an to of on at in as a i you we he she so do did how can has had more than then after before".split(
    " ",
  ),
);

export function timelineSearchTerms(question: string) {
  const words = [...new Set(question.toLowerCase().match(/[a-z]{2,}/g) ?? [])];
  const matched = Object.entries(concepts).filter(([, terms]) =>
    words.some((w) => (terms as readonly string[]).includes(w)),
  );
  const aliases = [...new Set(matched.flatMap(([, terms]) => [...terms]))];
  const related = matched.some(([name]) => name === "lowerLimb")
    ? [...concepts.exercise]
    : matched.some(([name]) => name === "exercise")
      ? [...concepts.lowerLimb]
      : [];
  // Bound work, but remove conversational filler BEFORE limiting query words.
  const lexical = words.filter((w) => !stopWords.has(w)).slice(0, 32);
  return {
    lexical: lexical.map((w) => `${w}:*`).join(" | "),
    aliases: aliases.length ? `\\m(${aliases.join("|")})\\M` : "(?!)",
    related: related.length ? `\\m(${related.join("|")})\\M` : "(?!)",
  };
}

/** Internal transaction function: caller must supply a current withAccess context.
 * RLS filters before ranking; only latest finalized heads can be candidates.
 * Three bounded lanes prevent persistent state/recent noise crowding out matches.
 */
export async function searchTimelineInAccess(
  a: AccessTransaction,
  patientPersonId: string,
  question: string,
  before?: Date,
  selection?: { day: string | null; broad: boolean; timezone: string },
) {
  z.uuid().parse(patientPersonId);
  z.string().max(10000).parse(question);
  const terms = timelineSearchTerms(question);
  const rows = (
    await a.tx.query(
      `
    with authorized as materialized (
      select e.id,e.logical_id,e.version,e.category,e.body,e.source_id,e.source_status,e.source_spans,e.status,
        e.occurred_at,e.recorded_at,e.author_account_id,s.captured_at,s.source_timezone,s.chat_message_id,s.parent_source_id,
        coalesce(e.occurred_at->>'at',e.occurred_at->>'from')::timestamptz event_date,
        concat_ws(' ',e.body->>'text',e.body->>'bodySite',array_to_string(e.source_spans,' ')) searchable
      from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id
      join mhistree.sources s on s.id=e.source_id
      where mhistree.canonical_person(e.patient_person_id)=mhistree.canonical_person($1)
        and e.visibility='finalized' and ($5::timestamptz is null or s.captured_at<$5)
        and ($6::date is null
          or ((e.occurred_at->>'at')::timestamptz >= ($6::date::timestamp at time zone $7)
            and (e.occurred_at->>'at')::timestamptz < (($6::date+1)::timestamp at time zone $7))
          or ((e.occurred_at->>'from')::timestamptz < (($6::date+1)::timestamp at time zone $7)
            and (e.occurred_at->>'to')::timestamptz > ($6::date::timestamp at time zone $7))
          or (e.occurred_at->>'precision'='unknown' and (s.captured_at at time zone $7)::date=$6::date))
    ), ranked as (
      select *,case when searchable ~* $3 then 3
        when $2<>'' and to_tsvector('english',searchable) @@ to_tsquery('english',$2) then 2
        when searchable ~* $4
          and event_date between coalesce($5::timestamptz,clock_timestamp())-interval '14 days'
            and coalesce($5::timestamptz,clock_timestamp()) then 1 else 0 end match_score from authorized
    ), selected as (
      (select id,0 lane from ranked where match_score>0 or $6::date is not null order by match_score desc,event_date desc nulls last,captured_at desc,id desc limit 16)
      union all
      (select id,1 lane from ranked where ($8::boolean or $9::boolean) and category in ('medication-use','allergy','baseline','ongoing') order by recorded_at desc,id desc limit 8)
      union all
      (select id,2 lane from ranked where ($8::boolean or $9::boolean) order by captured_at desc,id desc limit 8)
    ), choices as (select id,min(lane)::int search_lane from selected group by id)
      select r.*,s.search_lane from choices s join ranked r on r.id=s.id
      order by search_lane,match_score desc,event_date desc nulls last,captured_at desc,id desc`,
      [
        patientPersonId,
        terms.lexical,
        terms.aliases,
        terms.related,
        before ?? null,
        selection?.day ?? null,
        selection?.timezone ?? "UTC",
        !selection,
        selection?.broad ?? false,
      ],
    )
  ).rows;
  aiDebug("timeline.search.complete", {
    evidenceCount: rows.length,
    embeddingUsed: false,
    bounded: true,
    reason: "expanded-text-and-recent",
  });
  return rows;
}

/** Reusable server tool; identity/context are supplied by the authenticated owner,
 * never model-generated SQL or a model-selected patient/session.
 */
export function searchTimeline(
  pool: Pool,
  session: string,
  context: ActingContext,
  patientPersonId: string,
  question: string,
) {
  return withAccess(pool, session, context, (a) =>
    searchTimelineInAccess(a, patientPersonId, question),
  );
}
