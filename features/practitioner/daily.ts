import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { requirePractitioner } from "./profile";
import { directPatients } from "./patients";
import { withAccess } from "@/features/access/server";
import type { ActingContext } from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { requireCare } from "@/features/appointments/server";
export async function practitionerToday(
  pool: Pool,
  session: string,
  range?: { from: string; to: string },
) {
  if (range)
    z.object({
      from: z.iso.datetime({ offset: true }),
      to: z.iso.datetime({ offset: true }),
    })
      .refine(
        (v) =>
          Date.parse(v.to) > Date.parse(v.from) &&
          Date.parse(v.to) - Date.parse(v.from) <= 35 * 86400000,
      )
      .parse(range);
  const connections = (await directPatients(pool, session))
    .filter((c) => c.status === "active")
    .slice(0, 30);
  const items = [];
  for (const c of connections) {
    items.push(
      await withAccess(
        pool,
        session,
        { kind: "direct", connectionId: c.id },
        async (a) => ({
          connectionId: c.id,
          patientName: c.display_name,
          appointments: (
            await a.tx.query(
              range
                ? "select id,starts_at,ends_at,timezone,state,version from mhistree.appointments where connection_id=$1 and ((starts_at<$3 and ends_at>$2) or (state='requested' and ends_at>clock_timestamp())) order by starts_at limit 101"
                : "select id,starts_at,ends_at,timezone,state,version from mhistree.appointments where connection_id=$1 and starts_at>=clock_timestamp()-interval '1 day' order by starts_at limit 15",
              range ? [c.id, range.from, range.to] : [c.id],
            )
          ).rows,
          upcomingAppointment: range
            ? ((
                await a.tx.query(
                  "select id,starts_at,ends_at,timezone,state,version from mhistree.appointments where connection_id=$1 and state='accepted' and ends_at>clock_timestamp() order by starts_at,id limit 1",
                  [c.id],
                )
              ).rows[0] ?? null)
            : undefined,
          requests: (
            await a.tx.query(
              "select id,service_name,state,version,result_event_id from mhistree.service_requests where connection_id=$1 or recipient_connection_id=$1 order by created_at desc limit 15",
              [c.id],
            )
          ).rows,
          unread: (
            await a.tx.query(
              "select count(*)::int n from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=$1 and m.author_account_id<>$2 and m.sequence>coalesce((select sequence from mhistree.message_read_positions where account_id=$2 and thread_id=t.id),0)",
              [c.id, a.actor.accountId],
            )
          ).rows[0].n,
          reminders: (
            await a.tx.query(
              "select id,body,due_at from mhistree.clinical_work where connection_id=$1 and author_account_id=$2 and kind='reminder' and state='draft' order by due_at nulls last limit 15",
              [c.id, a.actor.accountId],
            )
          ).rows,
        }),
      ),
    );
  }
  const personal = await transaction(async (tx) => {
    const actor = await requirePractitioner(tx, session);
    return {
      availability: (
        await tx.query(
          "select id,starts_at,ends_at,timezone,version from mhistree.availability_slots where account_id=$1 and active and ends_at>clock_timestamp() order by starts_at limit 100",
          [actor.accountId],
        )
      ).rows,
      notifications: (
        await tx.query(
          "select n.id,n.kind,n.reference_id,n.connection_id,n.created_at from mhistree.notifications n join mhistree.connections c on c.id=n.connection_id where n.account_id=$1 and c.practitioner_account_id=$1 and c.status='active' order by n.created_at desc limit 50",
          [actor.accountId],
        )
      ).rows,
    };
  }, pool);
  const appointmentLimit = items.some((item) => item.appointments.length > 100);
  return {
    items: items.map((item) => ({
      ...item,
      appointments: item.appointments.slice(0, range ? 100 : 15),
    })),
    ...personal,
    limited: connections.length === 30 || appointmentLimit,
  };
}
const availabilityInput = z
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
  .strict()
  .refine(
    (v) =>
      new Date(v.startsAt) > new Date() &&
      new Date(v.endsAt) > new Date(v.startsAt) &&
      new Date(v.endsAt).getTime() - new Date(v.startsAt).getTime() <= 86400000,
  );

export async function saveAvailability(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = availabilityInput.parse(input);
  try {
    return await transaction(async (tx) => {
      const actor = await requirePractitioner(
        tx,
        session,
        "appointments.manage",
      );
      return (
        await tx.query(
          "insert into mhistree.availability_slots(account_id,starts_at,ends_at,timezone) values($1,$2,$3,$4) returning id",
          [actor.accountId, d.startsAt, d.endsAt, d.timezone],
        )
      ).rows[0];
    }, pool);
  } catch (e) {
    if ((e as { code?: string }).code === "23P01")
      throw new DomainError("VERSION_CONFLICT");
    throw e;
  }
}
export async function updateAvailability(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      startsAt: z.string(),
      endsAt: z.string(),
      timezone: z.string(),
    })
    .strict()
    .parse(input);
  const slot = availabilityInput.parse({
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    timezone: data.timezone,
  });
  try {
    return await transaction(async (tx) => {
      const actor = await requirePractitioner(
        tx,
        session,
        "appointments.manage",
      );
      const changed = await tx.query(
        "update mhistree.availability_slots set starts_at=$4,ends_at=$5,timezone=$6,version=version+1 where id=$1 and account_id=$2 and version=$3 and active returning id",
        [
          data.id,
          actor.accountId,
          data.version,
          slot.startsAt,
          slot.endsAt,
          slot.timezone,
        ],
      );
      if (!changed.rowCount) throw new DomainError("VERSION_CONFLICT");
      return changed.rows[0];
    }, pool);
  } catch (e) {
    if ((e as { code?: string }).code === "23P01")
      throw new DomainError("VERSION_CONFLICT");
    throw e;
  }
}
export async function removeAvailability(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({ id: z.uuid(), version: z.number().int().positive() })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await requirePractitioner(tx, session, "appointments.manage");
    const changed = await tx.query(
      "update mhistree.availability_slots set active=false,version=version+1 where id=$1 and account_id=$2 and version=$3 returning id",
      [d.id, actor.accountId, d.version],
    );
    if (!changed.rowCount) throw new DomainError("VERSION_CONFLICT");
    return changed.rows[0];
  }, pool);
}
export async function markThreadRead(
  pool: Pool,
  session: string,
  connectionId: string,
  selectedContext?: Extract<ActingContext, { kind: "organization" }>,
  throughSequence?: string,
) {
  z.uuid().parse(connectionId);
  if (throughSequence)
    z.string()
      .regex(/^\d{1,18}$/)
      .parse(throughSequence);
  return withAccess(
    pool,
    session,
    selectedContext ?? { kind: "direct", connectionId },
    async (a) => {
      await requireCare(a, connectionId, "messages.send");
      const row = (
        await a.tx.query(
          "select t.id,coalesce(max(m.sequence),0) sequence from mhistree.care_threads t left join mhistree.care_messages m on m.thread_id=t.id and ($2::bigint is null or m.sequence<=$2::bigint) where t.connection_id=$1 group by t.id",
          [connectionId, throughSequence ?? null],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      await a.tx.query(
        "insert into mhistree.message_read_positions(account_id,thread_id,sequence) values($1,$2,$3) on conflict(account_id,thread_id) do update set sequence=greatest(mhistree.message_read_positions.sequence,excluded.sequence)",
        [a.actor.accountId, row.id, row.sequence],
      );
      return { read: true };
    },
  );
}
