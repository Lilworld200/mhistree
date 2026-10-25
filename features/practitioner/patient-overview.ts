import "server-only";
import type { Pool } from "pg";
import {
  withAccess,
  type AccessTransaction,
  type ActingContext,
} from "@/features/access/server";
import { appendEvent } from "@/features/audit/server";
import { recordNarrative } from "@/features/health-records/narrative";
import { medicationPresentation } from "@/features/health-records/current-state";
import { DomainError } from "@/lib/errors";
import { directPatients } from "./patients";
import { assignedPatients } from "@/features/organizations/assignments";
import type { PatientOverview } from "./patient-types";

/** Current heads and RLS filter before excerpts are built; no model or raw chats. */
export async function patientOverviewInAccess(
  a: AccessTransaction,
  personId: string,
  now = new Date(),
): Promise<PatientOverview> {
  const state = await a.tx.query(
    "select e.* from mhistree.persistent_state p join mhistree.contributions e on e.id=p.event_id where e.patient_person_id=$1 and e.visibility='finalized' order by e.recorded_at desc,e.id desc limit 101",
    [personId],
  );
  const today = await a.tx.query(
    `select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id join mhistree.sources s on s.id=e.source_id where e.patient_person_id=$1 and e.visibility='finalized' and s.chat_message_id is not null and s.source_status='patient-reported' and s.captured_at>=((($2::timestamptz at time zone 'Africa/Lagos')::date)::timestamp at time zone 'Africa/Lagos') and s.captured_at<= $2::timestamptz order by s.captured_at desc,e.id desc limit 9`,
    [personId, now.toISOString()],
  );
  const recent = await a.tx.query(
    "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' order by e.recorded_at desc,e.id desc limit 9",
    [personId],
  );
  const prescriptions = await a.tx.query(
    "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' and e.category='prescription' order by e.recorded_at desc,e.id desc limit 11",
    [personId],
  );
  const results = await a.tx.query(
    "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' and e.category='result' and e.recorded_at >= $2::timestamptz-interval '7 days' and e.recorded_at<= $2::timestamptz order by e.recorded_at desc,e.id desc limit 4",
    [personId, now.toISOString()],
  );
  const counts = await a.tx.query(
    "select e.category,count(*)::int count from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' group by e.category order by e.category",
    [personId],
  );
  const excerpt = (r: (typeof state.rows)[number]) => ({
    id: r.id,
    text:
      recordNarrative(r).slice(0, 300) +
      (recordNarrative(r).length > 300 ? "..." : ""),
    category: r.category,
    sourceStatus: r.source_status,
    status: r.status,
    recordedAt: new Date(r.recorded_at).toISOString(),
  });
  const combined = [...state.rows.slice(0, 100), ...recent.rows.slice(0, 8)];
  const unique = [...new Map(combined.map((r) => [r.id, r])).values()].sort(
    (a, b) =>
      new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  );
  const summaryRows = today.rows.length
    ? today.rows.slice(0, 8)
    : unique.slice(0, 8);
  const medications = state.rows
    .slice(0, 100)
    .filter(
      (r) =>
        r.category === "medication-use" &&
        r.status !== "resolved" &&
        medicationPresentation(r.body, now).useStatus === "taking",
    );
  await appendEvent(a.tx, {
    actorAccountId: a.actor.accountId,
    personId,
    contextId: a.contextId,
    action: "record.read",
  });
  return {
    summaryKind: today.rows.length ? "today" : "overview",
    asOf: now.toISOString(),
    timezone: "Africa/Lagos",
    summary: summaryRows.map(excerpt),
    historyCounts: counts.rows,
    medications: medications.map(excerpt),
    prescriptions: prescriptions.rows.slice(0, 10).map(excerpt),
    results: results.rows.slice(0, 3).map(excerpt),
    limited:
      state.rows.length > 100 ||
      today.rows.length > 8 ||
      recent.rows.length > 8 ||
      prescriptions.rows.length > 10 ||
      results.rows.length > 3,
  };
}
async function overview(
  pool: Pool,
  session: string,
  context: ActingContext,
  personId: string,
) {
  return withAccess(pool, session, context, (a) =>
    patientOverviewInAccess(a, personId),
  );
}
// Limit parallel connections; each patient retains its own explicit policy context.
async function enrich<T>(
  rows: T[],
  load: (row: T) => Promise<PatientOverview | null>,
) {
  const result: (T & { overview: PatientOverview | null })[] = [];
  for (let i = 0; i < rows.length; i += 4)
    result.push(
      ...(await Promise.all(
        rows
          .slice(i, i + 4)
          .map(async (row) => ({ ...row, overview: await load(row) })),
      )),
    );
  return result;
}
async function permitted(load: () => Promise<PatientOverview>) {
  try {
    return await load();
  } catch (e) {
    if (
      e instanceof DomainError &&
      ["ACCESS_DENIED", "ACCESS_REVOKED", "CONSENT_REQUIRED"].includes(e.code)
    )
      return null;
    throw e;
  }
}
export async function directPatientCards(pool: Pool, session: string) {
  const rows = await directPatients(pool, session);
  return enrich(rows, (row) =>
    row.status === "active"
      ? permitted(() =>
          overview(
            pool,
            session,
            { kind: "direct", connectionId: row.id },
            row.patient_person_id,
          ),
        )
      : Promise.resolve(null),
  );
}
export async function assignedPatientCards(pool: Pool, session: string) {
  const rows = await assignedPatients(pool, session);
  return enrich(rows, (row) =>
    permitted(() =>
      overview(
        pool,
        session,
        row.basis_id
          ? {
              kind: "initial-care",
              basisId: row.basis_id,
              organizationId: row.organization_id,
              assignmentId: row.assignment_id,
            }
          : {
              kind: "organization",
              connectionId: row.connection_id,
              organizationId: row.organization_id,
              assignmentId: row.assignment_id,
            },
        row.patient_person_id,
      ),
    ),
  );
}
