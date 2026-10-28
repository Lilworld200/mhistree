import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { appendEvent } from "@/features/audit/server";
import { resolveTime } from "@/features/ai-chat/extraction/time";
import { careNoteInput, careNoteBody } from "./care-note-schema";
import { saveWorkInAccess } from "./work";
import { finalizeEntryInAccess } from "./entries";
import { syncReviewedMedication, localDay } from "./medication-recommendations";

async function notePatient(a: AccessTransaction) {
  const c = a.context;
  if (c.kind === "patient") throw new DomainError("ACCESS_DENIED");
  const row = (
    await a.tx.query(
      c.kind === "initial-care"
        ? "select patient_person_id from mhistree.initial_care_bases where id=$1 and account_id=$2 and active"
        : "select patient_person_id from mhistree.connections where id=$1 and status='active'",
      c.kind === "initial-care"
        ? [c.basisId, a.actor.accountId]
        : [c.connectionId],
    )
  ).rows[0];
  if (!row) throw new DomainError("ACCESS_DENIED");
  return row.patient_person_id as string;
}

/** Lock current authority metadata before the restricted role; no clinical rows or grants are broadened. */
async function lockNoteContext(
  tx: PoolClient,
  actor: AccessTransaction["actor"],
  context: ActingContext,
) {
  if (context.kind === "patient") throw new DomainError("ACCESS_DENIED");
  const row = await tx.query(
    context.kind === "initial-care"
      ? "select id from mhistree.initial_care_bases where id=$1 and account_id=$2 and active for share"
      : "select id from mhistree.connections where id=$1 and status='active' for share",
    context.kind === "initial-care"
      ? [context.basisId, actor.accountId]
      : [context.connectionId],
  );
  if (!row.rowCount) throw new DomainError("ACCESS_DENIED");
}

/** Explicit form review publishes through the same atomic work/event/state kernel as AI review. */
export async function saveCareNote(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = careNoteInput.parse(input);
  return withAccess(
    pool,
    session,
    context,
    async (a) => {
      const patient = await notePatient(a);
      if (patient !== d.patientPersonId) throw new DomainError("ACCESS_DENIED");
      if (["medication-use", "prescription"].includes(d.category))
        await a.tx.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [`medication-workflow:${patient}`],
        );
      const now = new Date(),
        day = localDay(now, d.timezone);
      if (
        d.destination === "record" &&
        [d.fields.actualStart, d.fields.actualEnd].some(
          (date) => date && date > day,
        )
      )
        throw new DomainError("VALIDATION_FAILED");
      const body = careNoteBody(d);
      const work = await saveWorkInAccess(a, {
        requestKey: d.requestKey,
        patientPersonId: patient,
        kind: d.destination === "note" ? "private-note" : "draft",
        category: d.category,
        body,
        occurredAt:
          d.destination === "record" && d.fields.eventDate
            ? resolveTime(d.fields.eventDate, now, d.timezone)
            : { precision: "unknown" },
        timezone: d.timezone,
      });
      if (d.destination === "note")
        return { destination: "note" as const, workId: work.id, eventId: null };
      const status =
        d.category === "medication-use"
          ? d.fields.useStatus === "taking"
            ? "active"
            : d.fields.useStatus === "stopped"
              ? "resolved"
              : "unknown"
          : d.fields.status;
      const result = await finalizeEntryInAccess(a, {
        id: work.id,
        version: 1,
        requestKey: d.requestKey,
        reviewed: true,
        status,
      });
      await syncReviewedMedication(a, {
        patientPersonId: patient,
        category: d.category,
        name: d.fields.name,
        text: body.text,
        eventId: result.eventId,
        useStatus: body.medication?.useStatus,
      });
      return { destination: "record" as const, workId: work.id, ...result };
    },
    (tx, actor) => lockNoteContext(tx, actor, context),
  );
}

const cursor = z
  .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
export async function privateNotes(
  pool: Pool,
  session: string,
  context: ActingContext,
  before?: string,
) {
  let position: z.infer<typeof cursor> | null = null;
  if (before) {
    if (before.length > 1000) throw new DomainError("VALIDATION_FAILED");
    try {
      position = cursor.parse(
        JSON.parse(Buffer.from(before, "base64url").toString("utf8")),
      );
    } catch {
      throw new DomainError("VALIDATION_FAILED");
    }
  }
  return withAccess(
    pool,
    session,
    context,
    async (a) => {
      const patient = await notePatient(a);
      const available = (
        await a.tx.query(
          "select 1 from unnest($1::text[]) category where mhistree.can_access($2,$2,category,'private',$3,$4,'write',$5) limit 1",
          [
            [
              "clinical",
              "symptom",
              "activity",
              "medication-use",
              "prescription",
              "allergy",
              "ongoing",
              "baseline",
            ],
            patient,
            a.actor.accountId,
            a.contextId,
            context.kind === "organization" || context.kind === "initial-care"
              ? context.organizationId
              : null,
          ],
        )
      ).rowCount;
      if (!available) throw new DomainError("ACCESS_DENIED");
      const rows = (
        await a.tx.query(
          "select id,category,body,version,state,created_at,updated_at from mhistree.clinical_work where original_context=$1 and patient_person_id=$2 and author_account_id=$3 and kind='private-note' and ($4::timestamptz is null or (updated_at,id)<($4::timestamptz,$5::uuid)) order by updated_at desc,id desc limit 21",
          [
            a.contextId,
            patient,
            a.actor.accountId,
            position?.at ?? null,
            position?.id ?? null,
          ],
        )
      ).rows;
      const items = rows.slice(0, 20),
        last = items.at(-1);
      await appendEvent(a.tx, {
        actorAccountId: a.actor.accountId,
        personId: patient,
        contextId: a.contextId,
        action: "record.read",
      });
      return {
        items,
        nextCursor:
          rows.length > 20 && last
            ? Buffer.from(
                JSON.stringify({
                  at: last.updated_at.toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      };
    },
    (tx, actor) => lockNoteContext(tx, actor, context),
  );
}
