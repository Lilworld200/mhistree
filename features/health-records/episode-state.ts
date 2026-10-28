import "server-only";
import type { AccessTransaction } from "@/features/access/server";

/** Bounded forward traversal of explicit episode links, never keyword similarity.
 * Historical event status stays intact; this supplementary state is a dated report.
 */
export async function episodeStates(a: AccessTransaction, ids: string[]) {
  if (!ids.length) return [];
  return (
    await a.tx.query(
      `with recursive observations as (
      select e.id root,e.id,e.logical_id,e.patient_person_id,e.status,e.body,e.occurred_at,s.captured_at,s.source_timezone,0 depth
      from mhistree.contributions e join mhistree.sources s on s.id=e.source_id
      where e.id=any($1::uuid[]) and e.category='symptom' and e.visibility='finalized'
      union all
      select o.root,n.id,n.logical_id,n.patient_person_id,n.status,n.body,n.occurred_at,n.captured_at,n.source_timezone,o.depth+1
      from observations o cross join lateral (
        select e.*,s.captured_at from mhistree.record_heads h
        join mhistree.contributions e on e.id=h.current_id
        join mhistree.sources s on s.id=e.source_id
        cross join lateral (
          select v.body->'episodeUpdate'->>'eventId' event_id from mhistree.contributions v
          where v.logical_id=e.logical_id and v.body ? 'episodeUpdate'
          order by v.version desc limit 1
        ) link
        join mhistree.contributions prior on prior.id::text=link.event_id
        where prior.logical_id=o.logical_id and e.patient_person_id=o.patient_person_id
          and e.category='symptom' and e.visibility='finalized'
        order by s.captured_at desc,e.recorded_at desc,e.id desc limit 1
      ) n where o.depth<8
    ) select distinct on(root) root,id,status,body->>'text' text,occurred_at as "eventTime",
       captured_at as "reportedAt",source_timezone as timezone,depth=8 bounded
      from observations where depth>0 order by root,depth desc`,
      [ids.slice(0, 50)],
    )
  ).rows;
}
