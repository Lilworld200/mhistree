import "server-only";
import type { Pool } from "pg";
import { withAccess, type ActingContext } from "@/features/access/server";
import { z } from "zod";
import { recordNarrative } from "@/features/health-records/narrative";
export type Evidence = {
  id: string;
  sourceId: string;
  group: string;
  text: string;
  category: string;
  sourceStatus: string;
  status: string;
  eventTime: unknown;
  capturedAt: string;
  spans: string[];
  contextLinks: string[];
  version: number;
  priorSources: { sourceId: string; version: number; spans: string[] }[];
  historyBounded: boolean;
  excerpted: boolean;
};
/** No cached index: current RLS and latest heads filter every retrieval before ranking. */
export async function retrieveEvidence(
  pool: Pool,
  session: string,
  context: ActingContext,
  patientPersonId: string,
  question: string,
) {
  z.uuid().parse(patientPersonId);
  z.string().max(10000).parse(question);
  const words = [...new Set(question.toLowerCase().match(/[a-z]{4,}/g) ?? [])]
    .slice(0, 8)
    .map((w) => `%${w}%`);
  return withAccess(pool, session, context, async (a) => {
    const rows = (
      await a.tx.query(
        `select e.*,s.captured_at,s.chat_message_id,s.parent_source_id from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id join mhistree.sources s on s.id=e.source_id
   where mhistree.canonical_person(e.patient_person_id)=mhistree.canonical_person($1) and e.visibility='finalized' order by
   case when e.category in ('medication-use','allergy','baseline','ongoing') then 0 when e.body->>'text' ilike any($2::text[]) then 1 else 2 end,
   e.recorded_at desc,e.id desc limit 40`,
        [patientPersonId, words],
      )
    ).rows;
    const priorSources = rows.length
      ? (
          await a.tx.query(
            `select current.id current_id,prior.source_id,prior.version,prior.source_spans
       from mhistree.contributions current
       cross join lateral (select source_id,version,source_spans from mhistree.contributions
         where logical_id=current.logical_id and version<current.version order by version desc limit 5) prior
       where current.id=any($1::uuid[])`,
            [rows.map((r) => r.id)],
          )
        ).rows
      : [];
    const allEvidence: Evidence[] = rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      group: row.chat_message_id ?? row.parent_source_id ?? row.source_id,
      text: recordNarrative(row).slice(0, 1200),
      category: row.category,
      sourceStatus: row.source_status,
      status: row.status,
      eventTime: row.occurred_at,
      capturedAt: row.captured_at.toISOString(),
      spans: row.source_spans.slice(0, 3),
      contextLinks: row.body.contextLinks,
      version: row.version,
      priorSources: priorSources
        .filter((p) => p.current_id === row.id)
        .map((p) => ({
          sourceId: p.source_id,
          version: p.version,
          spans: p.source_spans.slice(0, 3),
        })),
      historyBounded: row.version > 6,
      excerpted:
        recordNarrative(row).length > 1200 || row.source_spans.length > 3,
    }));
    const evidence: Evidence[] = [];
    let contextSize = 2;
    for (const item of allEvidence) {
      const size = JSON.stringify(item).length + 1;
      if (contextSize + size > 24000) break;
      evidence.push(item);
      contextSize += size;
    }
    const gaps =
      context.kind === "patient"
        ? (
            await a.tx.query(
              "select state,count(*)::int count from mhistree.extraction_jobs where state<>'succeeded' group by state",
            )
          ).rows
        : [];
    return {
      evidence,
      gaps,
      bounded:
        rows.length === 40 ||
        evidence.length < rows.length ||
        evidence.some((e) => e.excerpted || e.historyBounded),
      asOf: new Date().toISOString(),
    };
  });
}
