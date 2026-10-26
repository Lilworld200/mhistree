import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess, type AccessTransaction } from "@/features/access/server";
import { patientOverviewInAccess } from "./patient-overview";
import { DomainError } from "@/lib/errors";
import { listWorkInAccess } from "@/features/clinical-care/work";
import { requestListInAccess } from "@/features/clinical-care/requests";
import { careMessagesInAccess } from "@/features/messaging/server";
import { timelineInAccess } from "@/features/health-records/timeline";
import { appendEvent } from "@/features/audit/server";
import { category } from "@/features/health-records/schema";
export const workspaceView = z.enum([
  "all",
  "profile",
  "work",
  "requests",
  "messages",
]);
export type WorkspaceViewName = z.infer<typeof workspaceView>;
type Identity = {
  display_name: string;
  birth_date: string | null;
  mhistree_id: string | null;
  patient_person_id: string;
  revision: number;
};
/** Preserve the privileged minimum identity lookup, then restrict clinical reads
 * to the verified context on the same connection and transaction. */
function withDirectPatient<T>(
  pool: Pool,
  session: string,
  connectionId: string,
  read: (a: AccessTransaction, identity: Identity) => Promise<T>,
) {
  z.uuid().parse(connectionId);
  let identity: Identity;
  return withAccess(
    pool,
    session,
    { kind: "direct", connectionId },
    (a) => read(a, identity),
    async (tx, actor) => {
      const eligible = await tx.query(
        "select 1 from mhistree.professionals where account_id=$1 and status='approved' and 'records.read'=any(privileges) for share",
        [actor.accountId],
      );
      if (!eligible.rowCount) throw new DomainError("ACCESS_DENIED");
      const row = (
        await tx.query(
          "select p.display_name,p.birth_date,c.patient_person_id,c.revision,(select alias from mhistree.patient_identifiers i where i.person_id=p.id and i.retired_at is null order by created_at,alias limit 1) mhistree_id from mhistree.connections c join mhistree.persons p on p.id=c.patient_person_id where c.id=$1 and c.kind='direct' and c.practitioner_account_id=$2 and c.status='active' for share of c,p",
          [connectionId, actor.accountId],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      identity = row;
    },
  );
}
async function permissionsInAccess(a: AccessTransaction, personId: string) {
  const rows = (
    await a.tx.query(
      "select category,mhistree.can_access($1,$1,category,'finalized',$2,$3,'read',null) can_read,mhistree.can_access($1,$1,category,'finalized',$2,$3,'write',null) can_write from unnest($4::text[]) category",
      [personId, a.actor.accountId, a.contextId, category.options],
    )
  ).rows;
  if (!rows.some((p) => p.can_read)) throw new DomainError("ACCESS_DENIED");
  return {
    read: rows.filter((p) => p.can_read).map((p) => p.category as string),
    write: rows.filter((p) => p.can_write).map((p) => p.category as string),
  };
}
export function directTimeline(
  pool: Pool,
  session: string,
  connectionId: string,
  input: unknown,
) {
  return withDirectPatient(pool, session, connectionId, async (a, identity) => {
    await permissionsInAccess(a, identity.patient_person_id);
    return timelineInAccess(a, input);
  });
}
export function directWorkspace(
  pool: Pool,
  session: string,
  connectionId: string,
  view: WorkspaceViewName | "record" = "record",
) {
  return withDirectPatient(pool, session, connectionId, async (a, identity) => {
    const personId = identity.patient_person_id;
    const permissions = await permissionsInAccess(a, personId);
    const overview = await patientOverviewInAccess(a, personId);
    const state = (
      await a.tx.query(
        "select e.* from mhistree.persistent_state p join mhistree.contributions e on e.id=p.event_id where e.patient_person_id=$1 order by e.category,e.recorded_at desc limit 100",
        [personId],
      )
    ).rows;
    const recent =
      view === "all" || view === "record" || view === "requests"
        ? (
            await a.tx.query(
              "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' order by e.recorded_at desc,e.id desc limit 30",
              [personId],
            )
          ).rows
        : [];
    const flags = (
      await a.tx.query(
        "select exists(select 1 from mhistree.clinical_work where original_context=$1) has_work,exists(select 1 from mhistree.service_requests) has_requests,mhistree.can_participate($2,'messages.send') can_message",
        [a.contextId, connectionId],
      )
    ).rows[0];
    const work = ["all", "record", "work", "requests"].includes(view)
      ? await listWorkInAccess(a)
      : [];
    const requests =
      view === "all" || view === "requests" ? await requestListInAccess(a) : [];
    const messages =
      flags.can_message && (view === "all" || view === "messages")
        ? await careMessagesInAccess(a, connectionId)
        : null;
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId,
      contextId: a.contextId,
      action: "record.read",
    });
    return {
      patient: {
        display_name: identity.display_name,
        birth_date: identity.birth_date,
        mhistree_id: identity.mhistree_id,
      },
      patientPersonId: personId,
      permissions,
      overview,
      state,
      recent,
      work,
      requests,
      messages,
      capabilities: {
        work: permissions.write.length > 0 || flags.has_work,
        requests: permissions.read.includes("result") || flags.has_requests,
        messages: Boolean(flags.can_message),
      },
      context: a.context,
      revision: identity.revision,
      limited: state.length === 100 || recent.length === 30,
    };
  });
}
