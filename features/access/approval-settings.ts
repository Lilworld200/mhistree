import "server-only";
import { z } from "zod";
import type { Pool } from "pg";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { requirePractitioner } from "@/features/practitioner/profile";
import { category } from "@/features/health-records/schema";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
export const approvalRole = z.enum(["patient", "practitioner"]);
export async function connectionApprovalSettings(
  pool: Pool,
  session: string,
  role: z.infer<typeof approvalRole>,
) {
  approvalRole.parse(role);
  return transaction(async (tx) => {
    const actor =
      role === "practitioner"
        ? await requirePractitioner(tx, session)
        : await verifySession(tx, session);
    const row = (
      await tx.query(
        "select * from mhistree.connection_approval_settings where account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    return {
      enabled: Boolean(
        role === "patient"
          ? row?.patient_auto_approve
          : row?.practitioner_auto_approve,
      ),
      categories: row?.patient_categories ?? [],
      version: row?.version ?? 0,
    };
  }, pool);
}
export async function saveConnectionApprovalSettings(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .object({
      role: approvalRole,
      enabled: z.boolean(),
      version: z.number().int().nonnegative(),
      categories: z.array(category).max(10).optional(),
    })
    .strict()
    .parse(input);
  if (data.role === "patient" && data.enabled && !data.categories?.length)
    throw new DomainError("VALIDATION_FAILED");
  if (data.role === "practitioner" && data.categories !== undefined)
    throw new DomainError("VALIDATION_FAILED");
  return transaction(async (tx) => {
    const actor =
      data.role === "practitioner"
        ? await requirePractitioner(tx, session)
        : await verifySession(tx, session);
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `connection-settings:${actor.accountId}`,
    ]);
    const prior = (
      await tx.query(
        "select * from mhistree.connection_approval_settings where account_id=$1 for update",
        [actor.accountId],
      )
    ).rows[0];
    if ((prior?.version ?? 0) !== data.version)
      throw new DomainError("VERSION_CONFLICT");
    const patient =
      data.role === "patient"
        ? data.enabled
        : (prior?.patient_auto_approve ?? false);
    const practitioner =
      data.role === "practitioner"
        ? data.enabled
        : (prior?.practitioner_auto_approve ?? false);
    const categories =
      data.role === "patient"
        ? [...new Set(data.categories ?? prior?.patient_categories ?? [])]
        : (prior?.patient_categories ?? []);
    const version = data.version + 1;
    await tx.query(
      "insert into mhistree.connection_approval_settings(account_id,patient_auto_approve,practitioner_auto_approve,patient_categories,version) values($1,$2,$3,$4,$5) on conflict(account_id) do update set patient_auto_approve=$2,practitioner_auto_approve=$3,patient_categories=$4,version=$5,updated_at=clock_timestamp()",
      [actor.accountId, patient, practitioner, categories, version],
    );
    await tx.query(
      "insert into mhistree.connection_approval_setting_versions(account_id,version,patient_auto_approve,practitioner_auto_approve,patient_categories) values($1,$2,$3,$4,$5)",
      [actor.accountId, version, patient, practitioner, categories],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: actor.personId,
      action: "connection.approval-settings.updated",
      referenceId: actor.accountId,
      contextId: `account:${actor.accountId}`,
    });
    return { enabled: data.enabled, categories, version };
  }, pool);
}
