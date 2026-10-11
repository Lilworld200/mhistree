import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess } from "@/features/access/server";
import { appendEvent } from "@/features/audit/server";
export async function exportPage(
  pool: Pool,
  session: string,
  after: string | null = null,
  snapshot = new Date().toISOString(),
) {
  if (after) z.uuid().parse(after);
  z.iso.datetime().parse(snapshot);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const items = (
      await a.tx.query(
        `select e.*,s.content original_source,s.captured_at,s.chat_message_id,s.parent_source_id from mhistree.contributions e join mhistree.sources s on s.id=e.source_id where ($1::uuid is null or e.id>$1) and e.recorded_at <= $2::timestamptz order by e.id limit 200`,
        [after, snapshot],
      )
    ).rows;
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "patient.export.read",
    });
    return {
      items,
      nextCursor: items.length === 200 ? (items.at(-1)!.id as string) : null,
    };
  });
}
