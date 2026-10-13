import "server-only";
import { appendEvent } from "@/features/audit/server";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  preparePublication,
  recheckPublication,
  authorize,
} from "./server";
import { DomainError } from "@/lib/errors";

/** Storage keys are opaque and private; implementations must never return public URLs. */
export interface PrivateOriginalStore {
  read(key: string): Promise<Uint8Array>;
}
export async function readPrivateOriginal(
  pool: Pool,
  session: string,
  context: unknown,
  sourceId: string,
  store: PrivateOriginalStore,
) {
  z.uuid().parse(sourceId);
  const file = await withAccess(pool, session, context, async (access) => {
    const row = (
      await access.tx.query(
        `select f.*,s.patient_person_id,s.origin_person_id,s.category,s.visibility,s.author_account_id,s.original_context,s.original_organization_id from mhistree.private_files f join mhistree.sources s on s.id=f.source_id where f.source_id=$1`,
        [sourceId],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    return row;
  });
  const permit = await preparePublication(pool, session, context, {
    patientPersonId: file.patient_person_id,
    originPersonId: file.origin_person_id,
    category: file.category,
    visibility: file.visibility,
    authorAccountId: file.author_account_id,
    originalContext: file.original_context,
    originalOrganizationId: file.original_organization_id,
  });
  const bytes = await store.read(file.storage_key);
  if (
    bytes.byteLength !== Number(file.byte_length) ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    throw new DomainError("PROVIDER_UNAVAILABLE");
  await recheckPublication(pool, permit);
  await withAccess(pool, session, context, async (access) => {
    await authorize(access, permit.resource, "read");
    await appendEvent(access.tx, {
      actorAccountId: access.actor.accountId,
      personId: file.patient_person_id,
      action: "file.read.authorized",
      contextId: access.contextId,
      referenceId: sourceId,
    });
  });
  return bytes;
}
