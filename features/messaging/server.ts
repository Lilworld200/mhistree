import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess, type ActingContext } from "@/features/access/server";
import { requireCare } from "@/features/appointments/server";
import { DomainError } from "@/lib/errors";
import { appendEvent } from "@/features/audit/server";
export async function sendCareMessage(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const data = z
    .object({
      connectionId: z.uuid(),
      requestKey: z.uuid(),
      content: z.string().min(1).max(10000),
    })
    .strict()
    .parse(input);
  return withAccess(pool, session, context, async (a) => {
    const c = await requireCare(a, data.connectionId, "messages.send");
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `care-message:${a.actor.accountId}:${data.requestKey}`,
    ]);
    await a.tx.query(
      "insert into mhistree.care_threads(connection_id,patient_person_id) values($1,$2) on conflict(connection_id) do nothing",
      [c.id, c.patient_person_id],
    );
    const thread = (
      await a.tx.query(
        "select id from mhistree.care_threads where connection_id=$1",
        [c.id],
      )
    ).rows[0];
    if (!thread) throw new DomainError("ACCESS_DENIED");
    const prior = (
      await a.tx.query(
        "select id,content,thread_id from mhistree.care_messages where author_account_id=$1 and request_key=$2",
        [a.actor.accountId, data.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (prior.content !== data.content || prior.thread_id !== thread.id)
        throw new DomainError("VERSION_CONFLICT");
      return { id: prior.id, deliveryState: "stored" };
    }
    const row = (
      await a.tx.query(
        "insert into mhistree.care_messages(thread_id,author_account_id,content,request_key) values($1,$2,$3,$4) returning id",
        [thread.id, a.actor.accountId, data.content, data.requestKey],
      )
    ).rows[0];
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: c.patient_person_id,
      action: "care.message.saved",
      referenceId: row.id,
      contextId: a.contextId,
    });
    await a.tx.query(
      "insert into mhistree.outbox(kind,reference_id) values('care.message.saved',$1)",
      [row.id],
    );
    return { id: row.id, deliveryState: "stored" };
  });
}
export async function careMessages(
  pool: Pool,
  session: string,
  context: ActingContext,
  connectionId: string,
  before?: string,
) {
  z.uuid().parse(connectionId);
  if (before)
    z.string()
      .regex(/^\d{1,18}$/)
      .parse(before);
  return withAccess(pool, session, context, async (a) => {
    await requireCare(a, connectionId, "messages.send");
    const rows = (
      await a.tx.query(
        "select m.id,m.content,m.author_account_id,m.sent_at,m.delivery_state,m.sequence::text from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=$1 and ($2::bigint is null or m.sequence<$2::bigint) order by m.sequence desc limit 51",
        [connectionId, before ?? null],
      )
    ).rows;
    const more = rows.length > 50;
    const items = rows.slice(0, 50).reverse();
    return { items, nextCursor: more ? items[0].sequence : null };
  });
}
