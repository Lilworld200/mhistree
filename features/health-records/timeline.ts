import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess, type ActingContext } from "@/features/access/server";
import { appendEvent } from "@/features/audit/server";
import { category } from "./schema";
import { digest } from "@/features/auth/sessions";
import { DomainError } from "@/lib/errors";
const filters = z
  .object({
    category: category.optional(),
    source: z
      .enum(["patient-reported", "patient-uploaded", "professional-finalized"])
      .optional(),
    cursor: z.string().max(2000).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();
const cursorSchema = z
  .object({
    snapshot: z.iso.datetime({ offset: true }),
    filter: z.string(),
    bucket: z.number().int().min(0).max(1),
    time: z.iso.datetime({ offset: true }),
    id: z.uuid(),
  })
  .strict();
export async function timeline(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown = {},
) {
  const data = filters.parse(input);
  return withAccess(pool, session, context, async (a) => {
    const fingerprint = digest(
      JSON.stringify([
        a.actor.accountId,
        a.contextId,
        data.category ?? null,
        data.source ?? null,
      ]),
    );
    const cursor = data.cursor
      ? cursorSchema.parse(
          JSON.parse(Buffer.from(data.cursor, "base64url").toString("utf8")),
        )
      : null;
    if (cursor && cursor.filter !== fingerprint)
      throw new DomainError("ACCESS_DENIED");
    const snapshot =
      cursor?.snapshot ??
      (
        await a.tx.query(
          `select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') now`,
        )
      ).rows[0].now;
    const rows = (
      await a.tx.query(
        `with latest as (
   select distinct on(e.logical_id) e.* from mhistree.contributions e where e.recorded_at<=$1::timestamptz order by e.logical_id,e.version desc
  ), dated as(select e.*,s.captured_at,s.chat_message_id,s.parent_source_id,
   case when e.occurred_at->>'precision'='unknown' then 1 else 0 end bucket,
   coalesce((e.occurred_at->>'at')::timestamptz,(e.occurred_at->>'from')::timestamptz,e.recorded_at) sort_time
   from latest e join mhistree.sources s on s.id=e.source_id where ($2::text is null or e.category=$2) and ($3::text is null or e.source_status=$3))
   select *,to_char(sort_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') sort_key from dated where $4::int is null or bucket>$4 or(bucket=$4 and(sort_time<$5::timestamptz or(sort_time=$5::timestamptz and id<$6::uuid))) order by bucket,sort_time desc,id desc limit $7`,
        [
          snapshot,
          data.category ?? null,
          data.source ?? null,
          cursor?.bucket ?? null,
          cursor?.time ?? null,
          cursor?.id ?? null,
          data.limit + 1,
        ],
      )
    ).rows;
    const more = rows.length > data.limit;
    const items = rows.slice(0, data.limit);
    const last = items.at(-1);
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "record.read",
      contextId: a.contextId,
    });
    return {
      items,
      nextCursor:
        more && last
          ? Buffer.from(
              JSON.stringify({
                snapshot,
                filter: fingerprint,
                bucket: last.bucket,
                time: last.sort_key,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
      snapshot,
    };
  });
}
export async function sourcePreview(
  pool: Pool,
  session: string,
  context: ActingContext,
  id: string,
) {
  z.uuid().parse(id);
  return withAccess(pool, session, context, async (a) => {
    const row = (
      await a.tx.query(
        "select id,content,captured_at,source_timezone,source_status,chat_message_id,parent_source_id from mhistree.sources where id=$1",
        [id],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    // Clinical consumers receive only permitted spans, not an entire mixed-category patient message.
    if (context.kind !== "patient") throw new DomainError("ACCESS_DENIED");
    let root = row;
    for (let i = 0; i < 4 && root.parent_source_id; i++) {
      const parent = (
        await a.tx.query(
          "select id,parent_source_id from mhistree.sources where id=$1",
          [root.parent_source_id],
        )
      ).rows[0];
      if (!parent) throw new DomainError("ACCESS_DENIED");
      root = parent;
    }
    const original = (
      await a.tx.query(
        "select source_id from mhistree.private_files where source_id=$1",
        [root.id],
      )
    ).rows[0];
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "record.read",
      referenceId: id,
      contextId: a.contextId,
    });
    return { ...row, originalDocumentId: original?.source_id ?? null };
  });
}
export async function recordVersions(
  pool: Pool,
  session: string,
  logicalId: string,
) {
  z.uuid().parse(logicalId);
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) =>
      (
        await a.tx.query(
          "select id,version,body,source_id,source_status,recorded_at,supersedes_id from mhistree.contributions where logical_id=$1 order by version desc limit 50",
          [logicalId],
        )
      ).rows,
  );
}
