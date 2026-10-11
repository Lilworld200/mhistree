import "server-only";
import type { Pool } from "pg";
import { withAccess } from "@/features/access/server";
import { appendEvent } from "@/features/audit/server";
export function medicationPresentation(
  body: { medication?: { useStatus: string; plannedEnd: string | null } },
  now = new Date(),
) {
  const use = body.medication;
  if (!use)
    return {
      useStatus: "unknown",
      explanation: "Current use has not been established.",
    };
  if (
    use.useStatus === "taking" &&
    use.plannedEnd &&
    use.plannedEnd < now.toISOString().slice(0, 10)
  )
    return {
      useStatus: "unknown",
      explanation:
        "The planned course has ended. Actual current use is not confirmed; the original report is retained.",
    };
  return {
    useStatus: use.useStatus,
    explanation:
      "Patient-reported use; a prescription does not prove use or fulfillment.",
  };
}
export async function healthState(pool: Pool, session: string) {
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const rows = (
      await a.tx.query(
        "select e.*,s.captured_at from mhistree.persistent_state p join mhistree.contributions e on e.id=p.event_id join mhistree.sources s on s.id=e.source_id order by e.category,e.recorded_at desc,e.id desc limit 100",
      )
    ).rows;
    const prescriptions = (
      await a.tx.query(
        "select e.*,s.captured_at from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id join mhistree.sources s on s.id=e.source_id where e.category='prescription' order by e.recorded_at desc,e.id desc limit 30",
      )
    ).rows;
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "record.read",
      contextId: a.contextId,
    });
    return {
      items: rows.map((row) => ({
        ...row,
        medicationPresentation:
          row.category === "medication-use"
            ? medicationPresentation(row.body)
            : null,
      })),
      prescriptions,
      limited: rows.length === 100 || prescriptions.length === 30,
    };
  });
}
