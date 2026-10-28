import "server-only";
import type { AccessTransaction } from "@/features/access/server";
import { digest } from "@/features/auth/sessions";
import type { ExtractionContext } from "@/features/ai-chat/extraction/context";

/** Only this patient's earlier accepted inbox reports can supply clinical links. */
export async function inboxPatientContext(
  a: AccessTransaction,
  threadId: string,
  sequence: string,
): Promise<ExtractionContext> {
  const rows = (
    await a.tx.query(
      `select e.*,s.captured_at from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id join mhistree.sources s on s.id=e.source_id join mhistree.care_messages m on m.id=s.care_message_id where m.thread_id=$1 and m.sequence<$2::bigint and m.author_account_id=$3 and e.source_status='patient-reported' order by m.sequence desc,e.id limit 12`,
      [threadId, sequence, a.actor.accountId],
    )
  ).rows;
  const reports: ExtractionContext["reports"] = [];
  let size = 0;
  for (const r of rows) {
    const item = {
      id: r.id,
      logicalId: r.logical_id,
      version: r.version,
      category: r.category,
      status: r.status,
      body: r.body,
      eventTime: r.occurred_at,
      capturedAt: r.captured_at.toISOString(),
      quote: r.source_spans[0],
    };
    size += JSON.stringify(item).length;
    if (size > 8000) break;
    reports.push(item);
  }
  return {
    reports,
    messages: [],
    fingerprint: digest(JSON.stringify(reports)),
  };
}
