import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withAccess, type AccessTransaction } from "@/features/access/server";
import { careRecipientsInTransaction } from "@/features/access/patient-controls";
import type { VerifiedSession } from "@/features/auth/sessions";
import { sendCareMessageInAccess } from "@/features/messaging/server";
import { requestAppointmentInAccess } from "@/features/appointments/server";
import { DomainError } from "@/lib/errors";
import { aiDebug, aiDebugError } from "@/lib/ai/debug";
import {
  careDraft,
  chooseCareRecipients,
  reviewedCareDraft,
  type CareDraft,
  type CareOptions,
  type CareProposal,
  type PatientReply,
} from "./care-action-schema";

import {
  armCareConfirmation,
  confirmCareMessages,
  decoratedProposal,
  destinations,
} from "./care-delivery";
const kindSchema = z.enum(["message", "appointment"]);
const projection = "id,kind,payload,state,version,result_id";

/** Identity/availability only, before restricted clinical SET ROLE; never a clinical grant. */
async function optionsInIdentity(
  tx: PoolClient,
  actor: VerifiedSession,
  kind: CareProposal["kind"],
): Promise<CareOptions> {
  const discovered = await careRecipientsInTransaction(
    tx,
    actor,
    kind === "message" ? "messages.send" : "appointments.manage",
  );
  const recipients = discovered.connectedPractitioners;
  if (kind === "appointment" && recipients.length)
    await tx.query(
      "select id from mhistree.availability_slots where active and account_id=any($1::uuid[]) and ends_at>clock_timestamp() for share",
      [[...new Set(recipients.map((r) => r.practitionerId))]],
    );
  const slots =
    kind === "appointment" && recipients.length
      ? (
          await tx.query(
            `select s.id,t.start as "startsAt",t.start+interval '30 minutes' as "endsAt",s.timezone,s.account_id as "practitionerId"
     from mhistree.availability_slots s
     cross join lateral generate_series(s.starts_at+greatest(0,ceil(extract(epoch from (clock_timestamp()-s.starts_at))/1800))*interval '30 minutes',least(s.ends_at,clock_timestamp()+interval '90 days')-interval '30 minutes',interval '30 minutes') t(start)
     where s.active and s.account_id=any($1::uuid[]) and s.ends_at>clock_timestamp()
       and not exists(select 1 from mhistree.appointments a where a.practitioner_account_id=s.account_id and a.state in ('requested','accepted') and tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(t.start,t.start+interval '30 minutes','[)'))
     order by t.start,s.account_id,s.id limit 101`,
            [[...new Set(recipients.map((r) => r.practitionerId))]],
          )
        ).rows.map((r) => ({
          ...r,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
        }))
      : [];
  aiDebug("care.discovery", {
    state: "available",
    itemCount: recipients.length,
    bounded: discovered.bounded || slots.length > 100,
  });
  return {
    status: "available",
    recipients,
    bounded: discovered.bounded || slots.length > 100,
    slots: slots.slice(0, 100),
  };
}

export async function appointmentDiscovery(
  pool: Pool,
  session: string,
): Promise<CareOptions> {
  try {
    let options: CareOptions;
    return await withAccess(
      pool,
      session,
      { kind: "patient" },
      async () => options,
      async (tx, actor) => {
        options = await optionsInIdentity(tx, actor, "appointment");
      },
    );
  } catch (error) {
    if (
      error instanceof DomainError &&
      [
        "AUTH_REQUIRED",
        "SESSION_RETIRED",
        "ACCESS_DENIED",
        "ACCESS_REVOKED",
      ].includes(error.code)
    )
      throw error;
    aiDebugError("care.discovery.failed", error);
    return { status: "unavailable", recipients: [], bounded: false, slots: [] };
  }
}

export async function careProposalOptions(
  pool: Pool,
  session: string,
  id: string,
) {
  z.uuid().parse(id);
  let message: CareOptions, appointment: CareOptions;
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => {
      const row = (
        await a.tx.query(
          `select ${projection} from mhistree.chat_care_proposals where id=$1`,
          [id],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      return {
        proposal: await decoratedProposal(a, row as CareProposal),
        options: row.kind === "message" ? message : appointment,
      };
    },
    async (tx, actor) => {
      // Check ownership before any identity projection, and load only the requested capability.
      const row = (
        await tx.query(
          "select kind from mhistree.chat_care_proposals where id=$1 and account_id=$2",
          [id, actor.accountId],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      const options = await optionsInIdentity(
        tx,
        actor,
        kindSchema.parse(row.kind),
      );
      if (row.kind === "message") message = options;
      else appointment = options;
    },
  );
}

/** AI proposals can suggest only current eligible recipients; ambiguous selections remain empty. */
export async function storeCareProposal(
  a: AccessTransaction,
  replyId: string,
  action: NonNullable<PatientReply["action"]>,
  options: CareOptions,
  patientText: string,
  draftText?: string,
) {
  const selected = chooseCareRecipients(
    patientText,
    options.status === "available" ? options.recipients : [],
  );
  const recipient = selected[0];
  const payload: CareDraft = {
    content:
      action.kind === "message"
        ? draftText || reviewedCareDraft(patientText)
        : "",
    recipients: action.kind === "message" ? selected : undefined,
    connectionId: recipient?.connectionId ?? null,
    practitionerId: recipient?.practitionerId ?? null,
    connectionRevision: recipient?.connectionRevision ?? null,
    slot: null,
  };
  await a.tx.query(
    "insert into mhistree.chat_care_proposals(reply_message_id,account_id,kind,payload) values($1,$2,$3,$4)",
    [replyId, a.actor.accountId, action.kind, payload],
  );
}

const operationSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    action: z.enum(["update", "dismiss", "confirm", "arm", "disarm"]),
    payload: careDraft.optional(),
  })
  .strict()
  .refine((v) => (v.action === "update") === Boolean(v.payload));

export async function changeCareProposal(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = operationSchema.parse(input);
  if (data.action === "arm")
    return armCareConfirmation(pool, session, data.id, data.version);
  if (data.action === "disarm")
    return withAccess(pool, session, { kind: "patient" }, async (a) => {
      const row = (
        await a.tx.query(
          `select ${projection} from mhistree.chat_care_proposals where id=$1`,
          [data.id],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      await a.tx.query(
        "delete from mhistree.chat_care_confirmations where proposal_id=$1",
        [data.id],
      );
      return decoratedProposal(a, row);
    });
  if (data.action === "confirm") {
    const batch = await confirmCareMessages(
      pool,
      session,
      data.id,
      data.version,
    );
    if (batch) return batch;
  }
  let options: CareOptions | undefined;
  try {
    return await withAccess(
      pool,
      session,
      { kind: "patient" },
      async (a) => {
        const row = (
          await a.tx.query(
            `select ${projection},operation_key from mhistree.chat_care_proposals where id=$1 for update`,
            [data.id],
          )
        ).rows[0];
        if (!row) throw new DomainError("ACCESS_DENIED");
        // A lost confirmation response is recoverable without a second care write.
        if (
          row.state === "completed" &&
          data.action === "confirm" &&
          [row.version, row.version - 1].includes(data.version)
        )
          return {
            id: row.id,
            kind: row.kind,
            payload: row.payload,
            state: row.state,
            version: row.version,
            result_id: row.result_id,
          } as CareProposal;
        if (
          row.version !== data.version ||
          !["draft", "partial", "failed"].includes(row.state)
        )
          throw new DomainError("VERSION_CONFLICT");
        if (data.action === "dismiss") {
          await a.tx.query(
            "delete from mhistree.chat_care_confirmations where proposal_id=$1",
            [data.id],
          );
          return (
            await a.tx.query(
              `update mhistree.chat_care_proposals set state='dismissed',version=version+1,updated_at=clock_timestamp() where id=$1 returning ${projection}`,
              [data.id],
            )
          ).rows[0] as CareProposal;
        }
        const payload = careDraft.parse(data.payload ?? row.payload);
        const targets = destinations(payload);
        for (const selected of targets) {
          const eligible = options?.recipients.find(
            (r) =>
              r.connectionId === selected.connectionId &&
              r.practitionerId === selected.practitionerId &&
              r.revision === selected.connectionRevision,
          );
          const unchanged = destinations(careDraft.parse(row.payload)).some(
            (r) => JSON.stringify(r) === JSON.stringify(selected),
          );
          if (!eligible && !(data.action === "update" && unchanged))
            throw new DomainError("ACCESS_REVOKED");
        }
        const recipient = options?.recipients.find(
          (r) =>
            r.connectionId === payload.connectionId &&
            r.practitionerId === payload.practitionerId,
        );
        if (
          payload.recipients?.length &&
          (payload.connectionId !== payload.recipients[0].connectionId ||
            payload.practitionerId !== payload.recipients[0].practitionerId ||
            payload.connectionRevision !==
              payload.recipients[0].connectionRevision)
        )
          throw new DomainError("ACCESS_REVOKED");
        if (row.state !== "draft" && data.action === "update") {
          const attempted = (
            await a.tx.query(
              "select connection_id from mhistree.chat_care_deliveries where proposal_id=$1",
              [data.id],
            )
          ).rows;
          if (
            payload.content !== row.payload.content ||
            targets.some(
              (t) => !attempted.some((r) => r.connection_id === t.connectionId),
            )
          )
            throw new DomainError("VERSION_CONFLICT");
        }
        if (row.kind === "message") payload.slot = null;
        if (data.action === "update") {
          await a.tx.query(
            "delete from mhistree.chat_care_confirmations where proposal_id=$1",
            [data.id],
          );
          const updated = (
            await a.tx.query(
              `update mhistree.chat_care_proposals set payload=$2,version=version+1,updated_at=clock_timestamp() where id=$1 returning ${projection}`,
              [data.id, payload],
            )
          ).rows[0] as CareProposal;
          return decoratedProposal(a, updated);
        }
        if (!recipient) throw new DomainError("ACCESS_DENIED");
        let result;
        if (row.kind === "message") {
          if (!payload.content.trim())
            throw new DomainError("VALIDATION_FAILED");
          result = await sendCareMessageInAccess(a, {
            connectionId: recipient.connectionId,
            requestKey: row.operation_key,
            content: payload.content,
          });
        } else {
          const slot = payload.slot;
          if (
            !slot ||
            !options?.slots.some(
              (s) =>
                s.practitionerId === recipient.practitionerId &&
                s.startsAt === slot.startsAt &&
                s.endsAt === slot.endsAt &&
                s.timezone === slot.timezone,
            )
          )
            throw new DomainError("VERSION_CONFLICT");
          result = await requestAppointmentInAccess(a, {
            connectionId: recipient.connectionId,
            practitionerId: recipient.practitionerId,
            requestKey: row.operation_key,
            slot,
          });
        }
        const saved = (
          await a.tx.query(
            `update mhistree.chat_care_proposals set state='completed',result_id=$2,version=version+1,updated_at=clock_timestamp() where id=$1 returning ${projection}`,
            [data.id, result.id],
          )
        ).rows[0];
        aiDebug("care.confirmed", { state: "completed", category: row.kind });
        return saved as CareProposal;
      },
      async (tx, actor) => {
        const row = (
          await tx.query(
            "select kind,state from mhistree.chat_care_proposals where id=$1 and account_id=$2",
            [data.id, actor.accountId],
          )
        ).rows[0];
        if (!row) throw new DomainError("ACCESS_DENIED");
        if (
          ["draft", "partial", "failed"].includes(row.state) &&
          data.action !== "dismiss"
        )
          options = await optionsInIdentity(
            tx,
            actor,
            kindSchema.parse(row.kind),
          );
      },
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23P01")
      throw new DomainError("VERSION_CONFLICT");
    throw error;
  }
}
