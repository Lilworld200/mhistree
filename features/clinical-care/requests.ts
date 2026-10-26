import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { finalizeEntryInAccess } from "./entries";
import { appendEvent } from "@/features/audit/server";
async function participating(
  a: AccessTransaction,
  id: string,
  privilege: string,
) {
  if (
    !(
      await a.tx.query("select mhistree.can_participate($1,$2) allowed", [
        id,
        privilege,
      ])
    ).rows[0].allowed
  )
    throw new DomainError("ACCESS_DENIED");
}
export async function createServiceRequest(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({
      patientPersonId: z.uuid(),
      recipientConnectionId: z.uuid(),
      recipientAccountId: z.uuid(),
      serviceName: z.string().trim().min(2).max(200),
      priority: z.enum(["routine", "urgent"]),
      requestedFor: z.iso.datetime({ offset: true }).nullable(),
      authorizationBasis: z.string().min(10).max(1000),
      requestKey: z.uuid(),
    })
    .strict()
    .parse(input);
  if (context.kind !== "direct" && context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");
  return withAccess(pool, session, context, async (a) => {
    await participating(a, context.connectionId, "requests.create");
    const c = (
      await a.tx.query(
        "select patient_person_id from mhistree.connections where id=$1",
        [context.connectionId],
      )
    ).rows[0];
    if (c?.patient_person_id !== d.patientPersonId)
      throw new DomainError("ACCESS_DENIED");
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `request:${d.requestKey}`,
    ]);
    const prior = (
      await a.tx.query(
        "select * from mhistree.service_requests where request_key=$1",
        [d.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.requester_account_id !== a.actor.accountId ||
        prior.service_name !== d.serviceName ||
        prior.recipient_connection_id !== d.recipientConnectionId ||
        prior.connection_id !== context.connectionId
      )
        throw new DomainError("VERSION_CONFLICT");
      return prior;
    }
    const row = (
      await a.tx.query(
        "insert into mhistree.service_requests(connection_id,patient_person_id,service_name,state,requester_account_id,recipient_connection_id,recipient_account_id,priority,requested_for,authorization_basis,request_key) values($1,$2,$3,'requested',$4,$5,$6,$7,$8,$9,$10) returning *",
        [
          context.connectionId,
          d.patientPersonId,
          d.serviceName,
          a.actor.accountId,
          d.recipientConnectionId,
          d.recipientAccountId,
          d.priority,
          d.requestedFor,
          d.authorizationBasis,
          d.requestKey,
        ],
      )
    ).rows[0];
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: d.patientPersonId,
      contextId: a.contextId,
      referenceId: row.id,
      action: "clinical.request.updated",
    });
    return row;
  });
}
export async function requestList(
  pool: Pool,
  session: string,
  context: ActingContext,
) {
  return withAccess(pool, session, context, requestListInAccess);
}
export async function requestListInAccess(a: AccessTransaction) {
  return (
    await a.tx.query(
      "select id,connection_id,patient_person_id,service_name,state,version,requester_account_id,recipient_account_id,recipient_connection_id,priority,requested_for,result_event_id,result_work_id from mhistree.service_requests order by created_at desc,id desc limit 100",
    )
  ).rows;
}
export async function changeServiceRequest(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      action: z.enum([
        "accepted",
        "in-progress",
        "performed",
        "result-draft",
        "correct-result",
        "cancelled",
        "resume",
      ]),
      reason: z.string().min(10).max(1000).optional(),
      workId: z.uuid().optional(),
    })
    .strict()
    .parse(input);
  return withAccess(pool, session, context, async (a) => {
    const r = (
      await a.tx.query(
        "select * from mhistree.service_requests where id=$1 for update",
        [d.id],
      )
    ).rows[0];
    if (!r) throw new DomainError("ACCESS_DENIED");
    if (
      r.version !== d.version ||
      (r.state === "finalized" && d.action !== "correct-result") ||
      r.state === "cancelled"
    )
      throw new DomainError("VERSION_CONFLICT");
    const recipient = a.actor.accountId === r.recipient_account_id;
    await participating(
      a,
      recipient ? r.recipient_connection_id : r.connection_id,
      recipient ? "results.finalize" : "requests.create",
    );
    if (!recipient && d.action !== "cancelled")
      throw new DomainError("ACCESS_DENIED");
    if (
      !(
        await a.tx.query(
          "select status from mhistree.connections where id=$1",
          [r.connection_id],
        )
      ).rows.some((c) => c.status === "active") ||
      !(
        await a.tx.query(
          "select mhistree.valid_result_recipient($1,$2,$3) allowed",
          [
            r.recipient_connection_id,
            r.patient_person_id,
            r.recipient_account_id,
          ],
        )
      ).rows[0].allowed
    )
      throw new DomainError("ACCESS_DENIED");
    let state: string = d.action;
    const next: Record<string, string> = {
      requested: "accepted",
      accepted: "in-progress",
      "in-progress": "performed",
      performed: "result-draft",
    };
    if (d.action === "correct-result") {
      if (r.state !== "finalized" || !d.reason)
        throw new DomainError("VERSION_CONFLICT");
      state = "result-draft";
    } else if (d.action === "resume") {
      if (r.state !== "paused" || !d.reason)
        throw new DomainError("VERSION_CONFLICT");
      state = r.paused_from ?? "requested";
    } else if (d.action === "cancelled") {
      if (!d.reason) throw new DomainError("VERSION_CONFLICT");
    } else if (next[r.state] !== d.action)
      throw new DomainError("VERSION_CONFLICT");
    if (d.action === "result-draft" || d.action === "correct-result") {
      const w = (
        await a.tx.query("select * from mhistree.clinical_work where id=$1", [
          d.workId ?? null,
        ])
      ).rows[0];
      if (
        !w ||
        w.category !== "result" ||
        w.kind !== "draft" ||
        w.state !== "draft" ||
        w.patient_person_id !== r.patient_person_id ||
        w.author_account_id !== a.actor.accountId ||
        w.connection_id !== r.recipient_connection_id
      )
        throw new DomainError("ACCESS_DENIED");
    }
    const row = (
      await a.tx.query(
        "update mhistree.service_requests set state=$2,version=version+1,result_work_id=coalesce($3,result_work_id) where id=$1 returning *",
        [r.id, state, d.workId ?? null],
      )
    ).rows[0];
    await a.tx.query(
      "insert into mhistree.request_transitions(request_id,actor_account_id,from_state,to_state,reason) values($1,$2,$3,$4,$5)",
      [r.id, a.actor.accountId, r.state, state, d.reason ?? null],
    );
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: r.patient_person_id,
      contextId: a.contextId,
      referenceId: r.id,
      action: "clinical.request.updated",
    });
    return row;
  });
}
export async function publishResult(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({
      requestId: z.uuid(),
      version: z.number().int().positive(),
      entry: z.unknown(),
    })
    .strict()
    .parse(input);
  return withAccess(pool, session, context, async (a) => {
    const r = (
      await a.tx.query(
        "select * from mhistree.service_requests where id=$1 for update",
        [d.requestId],
      )
    ).rows[0];
    if (!r || r.recipient_account_id !== a.actor.accountId)
      throw new DomainError("ACCESS_DENIED");
    await participating(a, r.recipient_connection_id, "results.finalize");
    if (r.version !== d.version || r.state !== "result-draft")
      throw new DomainError("VERSION_CONFLICT");
    if (
      !(
        await a.tx.query(
          "select 1 from mhistree.connections where id=$1 and status='active'",
          [r.connection_id],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const entry = z.object({ id: z.uuid() }).passthrough().parse(d.entry);
    if (entry.id !== r.result_work_id) throw new DomainError("ACCESS_DENIED");
    if (r.result_event_id) {
      const previous = (
        await a.tx.query(
          "select logical_id,version from mhistree.contributions where id=$1",
          [r.result_event_id],
        )
      ).rows[0];
      const correction = z
        .object({ logicalId: z.uuid(), expectedVersion: z.number().int() })
        .parse(entry.correction);
      if (
        !previous ||
        correction.logicalId !== previous.logical_id ||
        correction.expectedVersion !== previous.version
      )
        throw new DomainError("VERSION_CONFLICT");
    } else if (entry.correction) throw new DomainError("ACCESS_DENIED");
    const result = await finalizeEntryInAccess(a, d.entry, r.id);
    await a.tx.query(
      "update mhistree.service_requests set state='finalized',version=version+1,result_event_id=$2 where id=$1",
      [r.id, result.eventId],
    );
    await a.tx.query(
      "insert into mhistree.request_transitions(request_id,actor_account_id,from_state,to_state) values($1,$2,'result-draft','finalized')",
      [r.id, a.actor.accountId],
    );
    return result;
  });
}
