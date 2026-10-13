import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess } from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { listWork } from "@/features/clinical-care/work";
import { appendEvent } from "@/features/audit/server";
export async function directWorkspace(
  pool: Pool,
  session: string,
  connectionId: string,
) {
  z.uuid().parse(connectionId);
  const context = { kind: "direct" as const, connectionId };
  const data = await withAccess(pool, session, context, async (a) => {
    const connection = (
      await a.tx.query(
        "select * from mhistree.connections where id=$1 and kind='direct' and practitioner_account_id=$2 and status='active'",
        [connectionId, a.actor.accountId],
      )
    ).rows[0];
    if (!connection) throw new DomainError("ACCESS_DENIED");
    const allowed = (
      await a.tx.query(
        "select exists(select 1 from unnest(ARRAY['clinical','allergy','medication-use','baseline','ongoing','symptom','activity','document','prescription','result']) category where mhistree.can_access($1,$1,category,'finalized',$2,$3,'read',null)) allowed",
        [connection.patient_person_id, a.actor.accountId, a.contextId],
      )
    ).rows[0];
    if (!allowed.allowed) throw new DomainError("ACCESS_DENIED");
    const state = (
      await a.tx.query(
        "select e.* from mhistree.persistent_state p join mhistree.contributions e on e.id=p.event_id where e.patient_person_id=$1 order by e.category,e.recorded_at desc limit 100",
        [connection.patient_person_id],
      )
    ).rows;
    const recent = (
      await a.tx.query(
        "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' order by e.recorded_at desc,e.id desc limit 30",
        [connection.patient_person_id],
      )
    ).rows;
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: connection.patient_person_id,
      contextId: a.contextId,
      action: "record.read",
    });
    return {
      patientPersonId: connection.patient_person_id,
      context,
      revision: connection.revision,
      state,
      recent,
      limited: state.length === 100 || recent.length === 30,
    };
  });
  return { ...data, work: await listWork(pool, session, context) };
}
