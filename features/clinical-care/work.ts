import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  authorize,
} from "@/features/access/server";
import { contributionInput, category } from "@/features/health-records/schema";
import { DomainError } from "@/lib/errors";
import { appendEvent } from "@/features/audit/server";
export const workInput = z
  .object({
    requestKey: z.uuid(),
    aiRunId: z.uuid().optional(),
    patientPersonId: z.uuid(),
    kind: z.enum(["private-note", "reminder", "draft"]),
    category,
    body: contributionInput.shape.body,
    occurredAt: contributionInput.shape.occurredAt,
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
    teamAccountIds: z.array(z.uuid()).max(20).default([]),
  })
  .strict();
export async function saveWork(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = workInput.parse(input);
  if (context.kind !== "direct" && context.kind !== "organization" && context.kind !== "initial-care")
    throw new DomainError("ACCESS_DENIED");
  if (
    (context.kind !== "organization" || d.kind !== "draft") &&
    d.teamAccountIds.length
  )
    throw new DomainError("ACCESS_DENIED");
  return withAccess(pool, session, context, async (a) => {
    await authorize(
      a,
      {
        patientPersonId: d.patientPersonId,
        originPersonId: d.patientPersonId,
        category: d.category,
        visibility: "private",
        authorAccountId: a.actor.accountId,
        originalContext: a.contextId,
        originalOrganizationId:
          context.kind === "organization" || context.kind === "initial-care" ? context.organizationId : null,
      },
      "write",
    );
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `work:${d.requestKey}`,
    ]);
    const existing = (
      await a.tx.query(
        "select * from mhistree.clinical_work where request_key=$1",
        [d.requestKey],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.author_account_id !== a.actor.accountId ||
        JSON.stringify(contributionInput.shape.body.parse(existing.body)) !==
          JSON.stringify(d.body) ||
        JSON.stringify(
          contributionInput.shape.occurredAt.parse(existing.occurred_at),
        ) !== JSON.stringify(d.occurredAt) ||
        existing.category !== d.category ||
        existing.timezone !== d.timezone ||
        (existing.due_at?.toISOString() ?? null) !==
          (d.dueAt ? new Date(d.dueAt).toISOString() : null) ||
        JSON.stringify(existing.team_account_ids) !==
          JSON.stringify(d.teamAccountIds) ||
        (existing.ai_provenance?.runId ?? null) !== (d.aiRunId ?? null) ||
        existing.patient_person_id !== d.patientPersonId ||
        existing.kind !== d.kind ||
        existing.original_context !== a.contextId
      )
        throw new DomainError("VERSION_CONFLICT");
      return existing;
    }
    const row = (
      await a.tx.query(
        "insert into mhistree.clinical_work(patient_person_id,author_account_id,connection_id,original_context,organization_id,kind,category,body,occurred_at,timezone,due_at,team_account_ids,request_key,initial_care_basis_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *",
        [
          d.patientPersonId,
          a.actor.accountId,
          context.kind === "initial-care" ? null : context.connectionId,
          a.contextId,
          context.kind === "organization" || context.kind === "initial-care" ? context.organizationId : null,
          d.kind,
          d.category,
          JSON.stringify(d.body),
          JSON.stringify(d.occurredAt),
          d.timezone,
          d.dueAt,
          d.teamAccountIds,
          d.requestKey,
          context.kind === "initial-care" ? context.basisId : null,
        ],
      )
    ).rows[0];
    if (d.aiRunId) {
      if (context.kind === "initial-care") throw new DomainError("ACCESS_DENIED");
      const run = (
        await a.tx.query(
          "select id,purpose from mhistree.practitioner_ai_runs where id=$1 and account_id=$2 and connection_id=$3",
          [d.aiRunId, a.actor.accountId, context.connectionId],
        )
      ).rows[0];
      if (!run || d.kind !== "draft") throw new DomainError("ACCESS_DENIED");
      await a.tx.query(
        "update mhistree.clinical_work set ai_provenance=$2 where id=$1",
        [
          row.id,
          JSON.stringify({
            runId: run.id,
            purpose: run.purpose,
            origin: "AI suggestion reviewed by human",
          }),
        ],
      );
    }
    await a.tx.query(
      "insert into mhistree.clinical_work_versions(work_id,version,actor_account_id,body,state) values($1,1,$2,$3,'draft')",
      [row.id, a.actor.accountId, JSON.stringify(d.body)],
    );
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: d.patientPersonId,
      contextId: a.contextId,
      referenceId: row.id,
      action: "clinical.work.saved",
    });
    return row;
  });
}
export async function listWork(
  pool: Pool,
  session: string,
  context: ActingContext,
) {
  return withAccess(
    pool,
    session,
    context,
    async (a) =>
      (
        await a.tx.query(
          "select * from mhistree.clinical_work where original_context=$1 order by updated_at desc,id limit 100",
          [a.contextId],
        )
      ).rows,
  );
}
export async function editWork(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      action: z.enum(["edit", "resume", "cancel"]),
      body: contributionInput.shape.body.optional(),
      reason: z.string().min(10).max(1000).optional(),
    })
    .strict()
    .parse(input);
  return withAccess(pool, session, context, async (a) => {
    const row = (
      await a.tx.query(
        "select * from mhistree.clinical_work where id=$1 for update",
        [d.id],
      )
    ).rows[0];
    if (!row || row.original_context !== a.contextId)
      throw new DomainError("ACCESS_DENIED");
    if (
      row.version !== d.version ||
      row.state === "finalized" ||
      row.state === "cancelled" ||
      (row.state === "paused" && d.action === "edit") ||
      (d.action === "resume" && (row.state !== "paused" || !d.reason))
    )
      throw new DomainError("VERSION_CONFLICT");
    const state = d.action === "cancel" ? "cancelled" : "draft";
    const body = d.body ?? row.body;
    const updated = (
      await a.tx.query(
        "update mhistree.clinical_work set body=$2,state=$3,version=version+1,updated_at=clock_timestamp() where id=$1 returning *",
        [d.id, JSON.stringify(body), state],
      )
    ).rows[0];
    await a.tx.query(
      "insert into mhistree.clinical_work_versions(work_id,version,actor_account_id,body,state) values($1,$2,$3,$4,$5)",
      [
        d.id,
        updated.version,
        a.actor.accountId,
        JSON.stringify({ body, reviewReason: d.reason ?? null }),
        state,
      ],
    );
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: row.patient_person_id,
      contextId: a.contextId,
      referenceId: row.id,
      action: "clinical.work.saved",
    });
    return updated;
  });
}
