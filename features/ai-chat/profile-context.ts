import "server-only";
import type { PoolClient } from "pg";
import type { VerifiedSession } from "@/features/auth/sessions";
import { DomainError } from "@/lib/errors";

/** Called only by withAccess's verified identity hook, before restricted clinical RLS. */
export async function patientIdentity(tx: PoolClient, actor: VerifiedSession) {
  const row = (
    await tx.query(
      "select display_name,birth_date::text,profile_version from mhistree.persons where id=$1 for share",
      [actor.personId],
    )
  ).rows[0];
  if (!row) throw new DomainError("ACCESS_DENIED");
  return {
    name: row.display_name as string,
    birthDate: row.birth_date as string | null,
    version: row.profile_version as number,
  };
}
