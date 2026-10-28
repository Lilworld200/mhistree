import { currentMedicationProjection } from "./medication-projection";
import "server-only";
import type { Pool } from "pg";
import { withAccess } from "@/features/access/server";
import { pendingRecommendations } from "@/features/clinical-care/medication-recommendations";
import { appendEvent } from "@/features/audit/server";
import { medicationPresentation } from "./current-state-presentation";
export { medicationPresentation } from "./current-state-presentation";
export async function healthState(pool: Pool, session: string) {
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const rows = (
      await a.tx.query(
        `select e.*,s.captured_at from mhistree.persistent_state p join mhistree.contributions e on e.id=p.event_id join mhistree.sources s on s.id=e.source_id where ${currentMedicationProjection} order by e.category,e.recorded_at desc,e.id desc limit 100`,
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
      recommendations: (await pendingRecommendations(a, "Africa/Lagos")).items,
      limited: rows.length === 100 || prescriptions.length === 30,
    };
  });
}
