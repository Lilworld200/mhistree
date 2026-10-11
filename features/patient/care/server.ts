import "server-only";
import type { Pool } from "pg";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { withAccess } from "@/features/access/server";
export async function eligibleCareProviders(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    return (
      await tx.query(
        `select distinct c.id connection_id,a.id practitioner_id,p.display_name,c.kind from mhistree.connections c
 join mhistree.accounts a on a.id=c.practitioner_account_id or(c.kind='organization' and exists(select 1 from mhistree.memberships m join mhistree.assignments ass on ass.organization_id=m.organization_id and ass.account_id=m.account_id where m.organization_id=c.organization_id and m.account_id=a.id and m.active and 'appointments.manage'=any(m.privileges) and ass.patient_person_id=c.patient_person_id and ass.active))
 join mhistree.persons p on p.id=a.person_id join mhistree.professionals prof on prof.account_id=a.id and prof.status='approved' and 'appointments.manage'=any(prof.privileges)
 where c.patient_person_id=$1 and c.status='active' and a.status='active' and(c.kind='direct' or exists(select 1 from mhistree.organizations o where o.id=c.organization_id and o.status='approved')) limit 100`,
        [actor.personId],
      )
    ).rows;
  }, pool);
}
export async function patientRequests(pool: Pool, session: string) {
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) =>
      (
        await a.tx.query(
          `select r.id,r.service_name,r.state,r.version,r.fixture,r.created_at,case when r.state='finalized' then e.id else null end result_event_id,case when r.state='finalized' then e.body else null end result_body from mhistree.service_requests r left join mhistree.contributions e on e.id=r.result_event_id and e.visibility='finalized' order by r.created_at desc,r.id desc limit 100`,
        )
      ).rows,
  );
}
