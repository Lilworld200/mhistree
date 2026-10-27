import "server-only";
import type { Pool } from "pg";
import { withAccess, type ActingContext } from "@/features/access/server";
import { z } from "zod";
import { recordNarrative } from "@/features/health-records/narrative";
import { aiDebug } from "@/lib/ai/debug";
import { searchTimelineInAccess } from "./timeline-search";
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
  sourceTimezone?: string;
  spans: string[];
  contextLinks: string[];
  version: number;
  priorSources: { sourceId: string; version: number; spans: string[] }[];
  historyBounded: boolean;
  excerpted: boolean;
  relevance:
    "topic-match" | "possible-context" | "persistent-state" | "recent-context";
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
  return withAccess(pool, session, context, async (a) => {
    const rows = await searchTimelineInAccess(a, patientPersonId, question);
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
      relevance:
        row.match_score >= 2
          ? "topic-match"
          : row.match_score === 1
            ? "possible-context"
            : row.search_lane === 1
              ? "persistent-state"
              : "recent-context",
      sourceId: row.source_id,
      group: row.chat_message_id ?? row.parent_source_id ?? row.source_id,
      text: recordNarrative(row).slice(0, 1200),
      category: row.category,
      sourceStatus: row.source_status,
      status: row.status,
      eventTime: row.occurred_at,
      capturedAt: row.captured_at.toISOString(),
      sourceTimezone: row.source_timezone,
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
    const result = {
      evidence,
      gaps,
      bounded:
        rows.length >= 8 ||
        evidence.length < rows.length ||
        evidence.some((e) => e.excerpted || e.historyBounded),
      asOf: new Date().toISOString(),
    };
    aiDebug("retrieval.complete", {
      evidenceCount: evidence.length,
      contextCharacters: contextSize,
      bounded: result.bounded,
      embeddingUsed: false,
      reason: "expanded-text-and-recent",
    });
    return result;
  });
}
