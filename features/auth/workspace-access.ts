import "server-only";
import type { Pool } from "pg";
import { transaction } from "@/lib/db/client";
import { verifySession } from "./sessions";

export type WorkspaceAccess = {
  practitioner: boolean;
  professionalProfile: boolean;
  organizations: boolean;
};
/** Own-account navigation projection; clinical authority is still checked by services. */
export function workspaceAccess(
  pool: Pool,
  session: string,
): Promise<WorkspaceAccess> {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const row = (
      await tx.query(
        `select
      exists(select 1 from mhistree.professionals where account_id=$1 and status='approved') practitioner,
      exists(select 1 from mhistree.professionals where account_id=$1) "professionalProfile",
      (exists(select 1 from mhistree.organization_applications where applicant_account_id=$1)
        or exists(select 1 from mhistree.memberships where account_id=$1 and active)
        or exists(select 1 from mhistree.organization_invitations i join mhistree.organizations o on o.id=i.organization_id
          where i.account_id=$1 and i.state='pending' and i.expires_at>clock_timestamp() and o.status='approved')) organizations`,
        [actor.accountId],
      )
    ).rows[0];
    return row;
  }, pool);
}
