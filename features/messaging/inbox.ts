import "server-only";
import type { Pool } from "pg";
import { withAccess, type ActingContext } from "@/features/access/server";
import { getConnectedPractitioners } from "@/features/access/patient-controls";
import { directPatients } from "@/features/practitioner/patients";
import { assignedPatients } from "@/features/organizations/assignments";
import { requireCare } from "@/features/appointments/server";
import { DomainError } from "@/lib/errors";

export async function inboxConnections(
  pool: Pool,
  session: string,
  practitioner = false,
) {
  const candidates: {
    connectionId: string;
    name: string;
    context: ActingContext;
    participants?: { accountId: string; name: string }[];
  }[] = [];
  if (practitioner) {
    for (const p of await directPatients(pool, session))
      if (p.status === "active")
        candidates.push({
          connectionId: p.id,
          name: p.display_name,
          context: { kind: "direct", connectionId: p.id },
        });
    for (const p of await assignedPatients(pool, session))
      if (p.connection_id)
        candidates.push({
          connectionId: p.connection_id,
          name: `${p.display_name} · ${p.organization_name}`,
          context: {
            kind: "organization",
            connectionId: p.connection_id,
            organizationId: p.organization_id,
            assignmentId: p.assignment_id,
          },
        });
  } else {
    for (const p of (await getConnectedPractitioners(pool, session))
      .connectedPractitioners) {
      if (!p.canMessage) continue;
      const existing = candidates.find(
        (c) => c.connectionId === p.connectionId,
      );
      if (existing) {
        existing.participants?.push({
          accountId: p.practitionerId,
          name: p.name,
        });
        existing.name += `, ${p.name}`;
      } else
        candidates.push({
          connectionId: p.connectionId,
          name: p.kind === "organization" ? `Care team: ${p.name}` : p.name,
          context: { kind: "patient" },
          participants: [{ accountId: p.practitionerId, name: p.name }],
        });
    }
  }

  const items = [];
  for (const c of candidates.slice(0, 100)) {
    try {
      items.push(
        await withAccess(pool, session, c.context, async (a) => {
          await requireCare(a, c.connectionId, "messages.send");
          const counts = (
            await a.tx.query(
              "select count(*) filter(where m.author_account_id<>$2 and m.sequence>coalesce(p.sequence,0))::int unread,max(m.sent_at) latest_at from mhistree.care_threads t left join mhistree.care_messages m on m.thread_id=t.id left join mhistree.message_read_positions p on p.thread_id=t.id and p.account_id=$2 where t.connection_id=$1",
              [c.connectionId, a.actor.accountId],
            )
          ).rows[0];
          return { ...c, ...counts };
        }),
      );
    } catch (e) {
      if (!(
        e instanceof DomainError &&
        ["ACCESS_DENIED", "ACCESS_REVOKED"].includes(e.code)
      ))
        throw e;
    }
  }
  return { items, limited: candidates.length >= 100 };
}
export async function acknowledgeInbox(
  pool: Pool,
  session: string,
  context: ActingContext,
  connectionId: string,
  throughSequence: string,
) {
  if (!/^\d{1,18}$/.test(throughSequence))
    throw new DomainError("VALIDATION_FAILED");
  return withAccess(pool, session, context, async (a) => {
    await requireCare(a, connectionId, "messages.send");
    const row = (
      await a.tx.query(
        "select t.id,m.sequence from mhistree.care_threads t join mhistree.care_messages m on m.thread_id=t.id where t.connection_id=$1 and m.sequence=$2::bigint",
        [connectionId, throughSequence],
      )
    ).rows[0];
    if (!row) throw new DomainError("VERSION_CONFLICT");
    await a.tx.query(
      "insert into mhistree.message_read_positions(account_id,thread_id,sequence) values($1,$2,$3) on conflict(account_id,thread_id) do update set sequence=greatest(message_read_positions.sequence,excluded.sequence)",
      [a.actor.accountId, row.id, row.sequence],
    );
    return { read: true };
  });
}
