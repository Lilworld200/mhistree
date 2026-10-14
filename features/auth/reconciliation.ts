import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import type { CredentialProvider } from "@/lib/auth/provider";
import { transaction } from "@/lib/db/client";
import { requireStaff } from "@/features/identity/server";
import { verifySession } from "./sessions";
import { DomainError } from "@/lib/errors";
/** Restricted retry; local retirement denies access during provider outages. */
export async function reconcileRetiredSessions(
  pool: Pool,
  provider: CredentialProvider,
  session: string,
  personId: string,
) {
  z.uuid().parse(personId);
  const rows = await transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    await requireStaff(
      tx,
      { accountId: actor.accountId, contextId: "review:identity" },
      "identity.review",
    );
    return (
      await tx.query(
        "select a.provider,a.provider_subject,r.updated_at::text revision from mhistree.accounts a join mhistree.auth_reconciliation r on r.person_id=a.person_id where a.person_id=$1 and a.status in('retired','recovery-pending') and r.pending and r.operation='revoke-provider-sessions'",
        [personId],
      )
    ).rows;
  }, pool);
  for (const row of rows) {
    if (row.provider !== (provider.name ?? "keycloak"))
      throw new DomainError("PROVIDER_UNAVAILABLE");
    await provider.revokeSessions(row.provider_subject);
  }
  if (rows.length)
    await pool.query(
      "update mhistree.auth_reconciliation set pending=false,updated_at=clock_timestamp() where person_id=$1 and operation='revoke-provider-sessions' and updated_at=$2::timestamptz",
      [personId, rows[0].revision],
    );
  return { pending: false };
}
