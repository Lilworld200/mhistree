import "server-only";
import type { Pool } from "pg";
import { transaction } from "@/lib/db/client";
import { requirePractitioner } from "./profile";

/** Minimum current direct-care notification projection. No transcripts or raw
 * AI chat. Mirrors care participant checks without granting runtime table access. */
export function practitionerNotifications(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await requirePractitioner(tx, session);
    const rows = (
      await tx.query(
        `select c.id connection_id,count(m.id)::int unread
       from mhistree.connections c
       join mhistree.professionals prof on prof.account_id=c.practitioner_account_id
         and prof.status='approved' and 'messages.send'=any(prof.privileges)
       join lateral(select categories,exclusions from mhistree.consents where connection_id=c.id
         order by recorded_at desc,id desc limit 1) scope on true
       join mhistree.care_threads t on t.connection_id=c.id
       join mhistree.care_messages m on m.thread_id=t.id and m.author_account_id<>$1
       left join mhistree.message_read_positions pos on pos.thread_id=t.id and pos.account_id=$1
       where c.practitioner_account_id=$1 and c.kind='direct' and c.status='active'
         and m.sequence>coalesce(pos.sequence,0)
         and exists(select 1 from unnest(scope.categories) cat where not(cat=any(scope.exclusions)))
       group by c.id order by c.id limit 501`,
        [actor.accountId],
      )
    ).rows;
    return {
      connections: rows
        .slice(0, 500)
        .map((r) => ({
          connectionId: r.connection_id as string,
          unread: r.unread as number,
        })),
      limited: rows.length > 500,
    };
  }, pool);
}
