import { transaction } from "@/lib/db/client";
import { requirePractitioner } from "./profile";
import { patientOverviewInAccess } from "./patient-overview";
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
  // Minimum demographics are read only for an active connection owned by this
  // currently approved practitioner; no contacts or login identifiers are exposed.
  const patient = await transaction(async (tx) => {
    const actor = await requirePractitioner(tx, session);
    const row = (
      await tx.query(
        "select p.display_name,p.birth_date,(select alias from mhistree.patient_identifiers i where i.person_id=p.id and i.retired_at is null order by created_at,alias limit 1) mhistree_id from mhistree.connections c join mhistree.persons p on p.id=c.patient_person_id where c.id=$1 and c.kind='direct' and c.practitioner_account_id=$2 and c.status='active' for share of c,p",
        [connectionId, actor.accountId],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    return row;
  }, pool);
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
    const permissions = (
      await a.tx.query(
        "select category,mhistree.can_access($1,$1,category,'finalized',$2,$3,'read',null) can_read,mhistree.can_access($1,$1,category,'finalized',$2,$3,'write',null) can_write from unnest(ARRAY['clinical','allergy','medication-use','baseline','ongoing','symptom','activity','document','prescription','result']) category",
        [connection.patient_person_id, a.actor.accountId, a.contextId],
      )
    ).rows;
    const overview = await patientOverviewInAccess(
      a,
      connection.patient_person_id,
    );
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
      patient,
      permissions: {
        read: permissions.filter((p) => p.can_read).map((p) => p.category),
        write: permissions.filter((p) => p.can_write).map((p) => p.category),
      },
      overview,
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
