import "server-only";
import type { Pool } from "pg";
import { withAccess, type ActingContext } from "@/features/access/server";
import { z } from "zod";
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
   where e.patient_person_id=$1 and e.visibility='finalized' order by
   case when e.category in ('medication-use','allergy','baseline','ongoing') then 0 when e.body->>'text' ilike any($2::text[]) then 1 else 2 end,
   e.recorded_at desc,e.id desc limit 40`,
        [patientPersonId, words],
      )
    ).rows;
    const evidence: Evidence[] = rows.map((row) => ({
      id: row.id,
      sourceId: row.source_id,
      group: row.chat_message_id ?? row.parent_source_id ?? row.source_id,
      text: row.body.text,
      category: row.category,
      sourceStatus: row.source_status,
      status: row.status,
      eventTime: row.occurred_at,
      capturedAt: row.captured_at.toISOString(),
      spans: row.source_spans,
      contextLinks: row.body.contextLinks,
      version: row.version,
    }));
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
      bounded: rows.length === 40,
      asOf: new Date().toISOString(),
    };
  });
}
