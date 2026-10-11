import "server-only";
import { appendEvent } from "@/features/audit/server";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { DomainError } from "@/lib/errors";
import {
  digest,
  verifySession,
  type VerifiedSession,
} from "@/features/auth/sessions";

export const actingContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("patient") }).strict(),
  z.object({ kind: z.literal("direct"), connectionId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("organization"),
      connectionId: z.uuid(),
      organizationId: z.uuid(),
      assignmentId: z.uuid(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("initial-care"),
      basisId: z.uuid(),
      organizationId: z.uuid().nullable(),
      assignmentId: z.uuid().nullable(),
    })
    .strict(),
]);
export type ActingContext = z.infer<typeof actingContextSchema>;
export type ResourcePolicy = {
  patientPersonId: string;
  originPersonId: string;
  category: string;
  visibility: "finalized" | "draft" | "private";
  authorAccountId: string;
  originalContext: string;
  originalOrganizationId: string | null;
};
export type AccessTransaction = {
  tx: PoolClient;
  actor: VerifiedSession;
  context: ActingContext;
  contextId: string;
};

export async function withAccess<T>(
  pool: Pool,
  session: string,
  selectedContext: unknown,
  work: (access: AccessTransaction) => Promise<T>,
) {
  const context = actingContextSchema.parse(selectedContext);
  let deniedActor: string | undefined;
  try {
    return await transaction(async (tx) => {
      const actor = await verifySession(tx, session);
      deniedActor = actor.accountId;
      await tx.query(
        "select set_config('mhistree.session',$1,true),set_config('mhistree.context',$2,true)",
        [digest(session), JSON.stringify(context)],
      );
      await tx.query("set local role mhistree_runtime");
      const contextId =
        context.kind === "patient"
          ? `patient:${actor.accountId}`
          : context.kind === "initial-care"
            ? `initial-care:${context.basisId}`
            : `${context.kind}:${context.connectionId}`;
      return work({ tx, actor, context, contextId });
    }, pool);
  } catch (error) {
    if (
      deniedActor &&
      error instanceof DomainError &&
      ["ACCESS_DENIED", "ACCESS_REVOKED"].includes(error.code)
    ) {
      await transaction(
        (tx) =>
          appendEvent(tx, {
            action: "access.denied",
            actorAccountId: deniedActor,
          }),
        pool,
      );
    }
    throw error;
  }
}

export async function authorize(
  access: AccessTransaction,
  resource: ResourcePolicy,
  operation: "read" | "write",
) {
  const r = resource;
  const { rows } = await access.tx.query(
    "select mhistree.can_access($1,$2,$3,$4,$5,$6,$7,$8) allowed",
    [
      r.patientPersonId,
      r.originPersonId,
      r.category,
      r.visibility,
      r.authorAccountId,
      r.originalContext,
      operation,
      r.originalOrganizationId,
    ],
  );
  if (!rows[0]?.allowed) throw new DomainError("ACCESS_DENIED");
}

export async function revokeConnection(
  pool: Pool,
  session: string,
  connectionId: string,
) {
  z.uuid().parse(connectionId);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const connection = (
      await tx.query(
        "select * from mhistree.connections where id=$1 and patient_person_id=$2 for update",
        [connectionId, actor.personId],
      )
    ).rows[0];
    if (!connection) throw new DomainError("ACCESS_DENIED");
    if (connection.status === "revoked") return;
    const changed = (
      await tx.query(
        "update mhistree.connections set status='revoked',revision=revision+1 where id=$1 returning revision",
        [connectionId],
      )
    ).rows[0];
    await tx.query(
      "update mhistree.dependent_work set state='paused',paused_at=clock_timestamp() where connection_id=$1 and state='pending'",
      [connectionId],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: actor.personId,
      action: "connection.revoked",
      contextId: connectionId,
    });
    await tx.query(
      "insert into mhistree.outbox(kind,reference_id,revision) values('access.invalidated',$1,$2) on conflict do nothing",
      [connectionId, changed.revision],
    );
  }, pool);
}

/** Narrow internal publication ticket; bearer/session is kept server-side only. */
export type PublicationPermit = {
  session: string;
  context: ActingContext;
  resource: ResourcePolicy;
  connectionRevision: number | null;
};
export async function preparePublication(
  pool: Pool,
  session: string,
  context: unknown,
  resource: ResourcePolicy,
): Promise<PublicationPermit> {
  return withAccess(pool, session, context, async (access) => {
    await authorize(access, resource, "read");
    const c = access.context;
    const revision =
      c.kind === "direct" || c.kind === "organization"
        ? ((
            await access.tx.query(
              "select revision from mhistree.connections where id=$1",
              [c.connectionId],
            )
          ).rows[0].revision as number)
        : null;
    return { session, context: c, resource, connectionRevision: revision };
  });
}
export async function recheckPublication(
  pool: Pool,
  permit: PublicationPermit,
) {
  return withAccess(pool, permit.session, permit.context, async (access) => {
    await authorize(access, permit.resource, "read");
    const c = access.context;
    if (c.kind === "direct" || c.kind === "organization") {
      const row = (
        await access.tx.query(
          "select revision from mhistree.connections where id=$1",
          [c.connectionId],
        )
      ).rows[0];
      if (row.revision !== permit.connectionRevision)
        throw new DomainError("ACCESS_REVOKED");
    }
  });
}
