import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { recordSource, acceptContribution, readContribution } from "./server";
import { contributionInput } from "./schema";
import { DomainError } from "@/lib/errors";
import { withAccess } from "@/features/access/server";
import { appendEvent } from "@/features/audit/server";
export async function correctPatientReport(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .object({
      eventId: z.uuid(),
      version: z.number().int().positive(),
      requestKey: z.uuid(),
      text: z.string().min(1).max(3000),
      bodySite: z.string().max(100).nullable(),
      status: z.enum(["active", "resolved", "recurrent", "unknown"]),
      medication: contributionInput.shape.body.shape.medication,
    })
    .strict()
    .parse(input);
  const prior = await readContribution(
    pool,
    session,
    { kind: "patient" },
    data.eventId,
  );
  const actor = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => a.actor,
  );
  if (
    prior.author_account_id !== actor.accountId ||
    prior.source_status === "professional-finalized"
  )
    throw new DomainError("ACCESS_DENIED");
  const source = await recordSource(
    pool,
    session,
    { kind: "patient" },
    {
      patientPersonId: actor.personId,
      category: prior.category,
      sourceTimezone: prior.source_timezone,
      content: JSON.stringify({
        correctionOf: data.eventId,
        text: data.text,
        bodySite: data.bodySite,
        status: data.status,
        medication: data.medication,
      }),
      clientKey: data.requestKey,
    },
  );
  return acceptContribution(
    pool,
    session,
    { kind: "patient" },
    {
      sourceId: source.sourceId,
      sourceVersion: 1,
      sourceItemId: "patient-correction",
      operationKey: data.requestKey,
      body: {
        text: data.text,
        bodySite: data.bodySite,
        contextLinks: prior.body.contextLinks,
        ...(data.medication ? { medication: data.medication } : {}),
      },
      occurredAt: prior.occurred_at,
      status: data.status,
      sourceSpans: [data.text.slice(0, 500)],
      correction: {
        logicalId: prior.logical_id,
        expectedVersion: data.version,
      },
    },
  );
}
export async function requestReview(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .object({
      kind: z.enum(["professional-correction", "removal", "account-closure"]),
      eventId: z.uuid().nullable(),
      reason: z.string().trim().min(1).max(3000),
      requestKey: z.uuid(),
    })
    .strict()
    .parse(input);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    if (data.kind === "professional-correction" && !data.eventId)
      throw new DomainError("ACCESS_DENIED");
    if (
      data.eventId &&
      !(
        await a.tx.query("select id from mhistree.contributions where id=$1", [
          data.eventId,
        ])
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const prior = (
      await a.tx.query(
        "select * from mhistree.patient_review_requests where account_id=$1 and request_key=$2",
        [a.actor.accountId, data.requestKey],
      )
    ).rows[0];
    if (prior) {
      if (
        prior.kind !== data.kind ||
        prior.event_id !== data.eventId ||
        prior.reason !== data.reason
      )
        throw new DomainError("VERSION_CONFLICT");
      return { id: prior.id, state: prior.state };
    }
    const row = (
      await a.tx.query(
        "insert into mhistree.patient_review_requests(account_id,person_id,kind,event_id,reason,request_key) values($1,$2,$3,$4,$5,$6) returning id,state",
        [
          a.actor.accountId,
          a.actor.personId,
          data.kind,
          data.eventId,
          data.reason,
          data.requestKey,
        ],
      )
    ).rows[0];
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "patient.review.requested",
      referenceId: row.id,
    });
    return row;
  });
}
