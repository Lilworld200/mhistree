import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { appendEvent } from "@/features/audit/server";
export async function requireCare(
  access: AccessTransaction,
  connectionId: string,
  privilege: "appointments.manage" | "messages.send" | "requests.read",
) {
  const permitted = (
    await access.tx.query("select mhistree.can_participate($1,$2) allowed", [
      connectionId,
      privilege,
    ])
  ).rows[0];
  if (!permitted?.allowed) throw new DomainError("ACCESS_DENIED");
  const connection = (
    await access.tx.query("select * from mhistree.connections where id=$1", [
      connectionId,
    ])
  ).rows[0];
  if (!connection) throw new DomainError("ACCESS_DENIED");
  return connection;
}
const slot = z
  .object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
  })
  .refine(
    (v) =>
      new Date(v.endsAt) > new Date(v.startsAt) &&
      new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <=
        8 * 3600000,
  );
export async function requestAppointment(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  return saveAppointment(pool, session, context, input, false);
}

// The direct clinician books in their own server-established care context.
export async function createPractitionerAppointment(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  return saveAppointment(pool, session, context, input, true);
}
async function saveAppointment(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
  clinicianBooking: boolean,
) {
  const data = z
    .object({
      connectionId: z.uuid(),
      practitionerId: clinicianBooking ? z.never().optional() : z.uuid(),
      requestKey: z.uuid(),
      slot,
    })
    .strict()
    .parse(input);
  try {
    return await withAccess(pool, session, context, async (a) => {
      const connection = await requireCare(
        a,
        data.connectionId,
        "appointments.manage",
      );
      const practitionerId = clinicianBooking
        ? a.actor.accountId
        : data.practitionerId;
      if (
        clinicianBooking &&
        (context.kind !== "direct" ||
          context.connectionId !== connection.id ||
          connection.practitioner_account_id !== a.actor.accountId)
      )
        throw new DomainError("ACCESS_DENIED");
      await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `booking:${data.requestKey}`,
      ]);
      const existing = (
        await a.tx.query(
          "select * from mhistree.appointments where request_key=$1",
          [data.requestKey],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.connection_id !== data.connectionId ||
          existing.practitioner_account_id !== practitionerId ||
          existing.timezone !== data.slot.timezone ||
          existing.starts_at.toISOString() !==
            new Date(data.slot.startsAt).toISOString() ||
          existing.ends_at.toISOString() !==
            new Date(data.slot.endsAt).toISOString()
        )
          throw new DomainError("VERSION_CONFLICT");
        return existing;
      }
      if (new Date(data.slot.startsAt) <= new Date())
        throw new DomainError("VERSION_CONFLICT");
      const row = (
        await a.tx.query(
          "insert into mhistree.appointments(connection_id,patient_person_id,practitioner_account_id,starts_at,ends_at,timezone,request_key,state) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",
          [
            connection.id,
            connection.patient_person_id,
            practitionerId,
            data.slot.startsAt,
            data.slot.endsAt,
            data.slot.timezone,
            data.requestKey,
            clinicianBooking ? "accepted" : "requested",
          ],
        )
      ).rows[0];
      await appendEvent(a.tx, {
        actorAccountId: a.actor.accountId,
        personId: connection.patient_person_id,
        action: clinicianBooking
          ? "appointment.booked"
          : "appointment.requested",
        referenceId: row.id,
        contextId: a.contextId,
      });
      return row;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23P01")
      throw new DomainError("VERSION_CONFLICT");
    throw error;
  }
}
export async function changeAppointment(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const data = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      action: z.enum(["accept", "decline", "cancel", "reschedule"]),
      slot: slot.optional(),
    })
    .strict()
    .refine(
      (value) => (value.action === "reschedule") === Boolean(value.slot),
      {
        message:
          "Only rescheduling accepts a replacement slot, and requires one.",
      },
    )
    .parse(input);
  try {
    return await withAccess(pool, session, context, async (a) => {
      const row = (
        await a.tx.query(
          "select * from mhistree.appointments where id=$1 for update",
          [data.id],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      await requireCare(a, row.connection_id, "appointments.manage");
      if (
        row.version !== data.version ||
        !["requested", "accepted"].includes(row.state)
      )
        throw new DomainError("VERSION_CONFLICT");
      if (
        ["accept", "decline"].includes(data.action) &&
        (context.kind === "patient" ||
          a.actor.accountId !== row.practitioner_account_id)
      )
        throw new DomainError("ACCESS_DENIED");
      if (
        data.action === "reschedule" &&
        (!data.slot || new Date(data.slot.startsAt) <= new Date())
      )
        throw new DomainError("VERSION_CONFLICT");
      const state = {
        accept: "accepted",
        decline: "declined",
        cancel: "cancelled",
        reschedule:
          row.state === "accepted" &&
          context.kind === "direct" &&
          a.actor.accountId === row.practitioner_account_id
            ? "accepted"
            : "requested",
      }[data.action];
      const updated = (
        await a.tx.query(
          "update mhistree.appointments set state=$2,starts_at=$3,ends_at=$4,timezone=$5,version=version+1 where id=$1 returning *",
          [
            row.id,
            state,
            data.slot?.startsAt ?? row.starts_at,
            data.slot?.endsAt ?? row.ends_at,
            data.slot?.timezone ?? row.timezone,
          ],
        )
      ).rows[0];
      await appendEvent(a.tx, {
        actorAccountId: a.actor.accountId,
        personId: row.patient_person_id,
        action: "appointment.updated",
        referenceId: row.id,
        contextId: a.contextId,
      });
      return updated;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23P01")
      throw new DomainError("VERSION_CONFLICT");
    throw error;
  }
}
export async function listAppointments(
  pool: Pool,
  session: string,
  context: ActingContext = { kind: "patient" },
) {
  return withAccess(
    pool,
    session,
    context,
    async (a) =>
      (
        await a.tx.query(
          "select id,connection_id,practitioner_account_id,starts_at,ends_at,timezone,state,version from mhistree.appointments order by starts_at desc,id desc limit 100",
        )
      ).rows,
  );
}
