import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { verifySession, digest } from "@/features/auth/sessions";
import { category } from "@/features/health-records/schema";
import { consentInTransaction } from "./patient-controls";
import { DomainError } from "@/lib/errors";

export async function searchPractitioners(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const { query } = z
    .object({ query: z.string().trim().min(2).max(80) })
    .strict()
    .parse(input);
  await consumeAttempt(pool, "sharing.search", digest(session), 30);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    // Search only professional display information, never contacts, credentials or patient data.
    const rows = await tx.query(
      `select a.id, p.display_name, coalesce(app.profession,'Healthcare practitioner') profession,
       coalesce(app.jurisdiction,'') jurisdiction
       from mhistree.professionals pro join mhistree.accounts a on a.id=pro.account_id
       join mhistree.persons p on p.id=a.person_id
       left join lateral(select profession,jurisdiction from mhistree.professional_applications
         where account_id=a.id order by submitted_at desc,id desc limit 1) app on true
       where pro.status='approved' and a.status='active' and 'records.read'=any(pro.privileges)
       and mhistree.canonical_person(a.person_id)<>$1
       and (strpos(lower(p.display_name),lower($2))>0 or strpos(lower(coalesce(app.profession,'')),lower($2))>0)
       order by lower(p.display_name),a.id limit 21`,
      [actor.personId, query],
    );
    return { items: rows.rows.slice(0, 20), hasMore: rows.rows.length > 20 };
  }, pool);
}

export async function connectPractitioner(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .object({
      practitionerId: z.uuid(),
      requestKey: z.uuid(),
      categories: z.array(category).min(1).max(10),
      exclusions: z.array(category).max(10),
    })
    .strict()
    .parse(input);
  await consumeAttempt(pool, "sharing.connect", digest(session), 20);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `direct:${data.practitionerId}:${actor.personId}`,
    ]);
    const hash = digest(JSON.stringify(data));
    const replay = (
      await tx.query(
        "select * from mhistree.direct_connection_operations where request_key=$1",
        [data.requestKey],
      )
    ).rows[0];
    if (replay) {
      if (
        replay.actor_account_id !== actor.accountId ||
        replay.body_hash !== hash
      )
        throw new DomainError("VERSION_CONFLICT");
      // Retried confirmation never reactivates a subsequently revoked connection.
      return { id: replay.connection_id, replayed: true };
    }
    const practitioner = (
      await tx.query(
        `select a.id from mhistree.professionals pro join mhistree.accounts a on a.id=pro.account_id
       where a.id=$1 and a.status='active' and pro.status='approved'
       and 'records.read'=any(pro.privileges) and mhistree.canonical_person(a.person_id)<>$2
       for share of a,pro`,
        [data.practitionerId, actor.personId],
      )
    ).rows[0];
    if (!practitioner) throw new DomainError("ACCESS_DENIED");
    // Existing connections must use the versioned approval/reconnection controls instead.
    if (
      (
        await tx.query(
          "select id from mhistree.connections where mhistree.canonical_person(patient_person_id)=$1 and practitioner_account_id=$2 and kind='direct'",
          [actor.personId, data.practitionerId],
        )
      ).rowCount
    )
      throw new DomainError("VERSION_CONFLICT");
    const autoApprove = Boolean(
      (
        await tx.query(
          "select practitioner_auto_approve from mhistree.connection_approval_settings where account_id=$1 for share",
          [practitioner.id],
        )
      ).rows[0]?.practitioner_auto_approve,
    );
    const connection = (
      await tx.query(
        "insert into mhistree.connections(patient_person_id,kind,practitioner_account_id,status,patient_approved,practitioner_approved) values($1,'direct',$2,'pending',false,$3) returning id,revision",
        [actor.personId, data.practitionerId, autoApprove],
      )
    ).rows[0];
    await consentInTransaction(tx, actor, {
      connectionId: connection.id,
      version: connection.revision,
      mode: "approve",
      categories: data.categories,
      exclusions: data.exclusions,
    });
    await tx.query(
      "insert into mhistree.direct_connection_operations values($1,$2,$3,$4)",
      [data.requestKey, actor.accountId, connection.id, hash],
    );
    return { id: connection.id, replayed: false };
  }, pool);
}

export async function patientAccessHistory(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .object({
      connectionId: z.uuid().optional(),
      before: z
        .object({
          at: z.iso.datetime({ offset: true }),
          id: z.string().regex(/^[0-9]{1,19}$/),
        })
        .strict()
        .optional(),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    if (
      data.connectionId &&
      !(
        await tx.query(
          "select id from mhistree.connections where id=$1 and mhistree.canonical_person(patient_person_id)=$2",
          [data.connectionId, actor.personId],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const rows = (
      await tx.query(
        `select e.id,e.action,to_char(e.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') recorded_at,
       case when e.actor_account_id=$2 then 'You' when e.actor_account_id is null then 'Mhistree system'
       else coalesce(p.display_name,'Care team member') end actor_name,
       coalesce(o.display_name,cp.display_name) connection_name,
       case when c.kind='organization' then 'Organization' when c.kind='direct' then 'Direct practitioner'
       when e.context_id like 'patient:%' then 'Personal account' else 'Recorded context' end context_label
       from mhistree.audit_events e
       left join mhistree.accounts a on a.id=e.actor_account_id
       left join mhistree.persons p on p.id=a.person_id
       left join mhistree.connections c on mhistree.canonical_person(c.patient_person_id)=$1
        and (e.context_id in(c.id::text,'direct:'||c.id::text,'organization:'||c.id::text) or e.reference_id=c.id::text)
       left join mhistree.accounts ca on ca.id=c.practitioner_account_id
       left join mhistree.persons cp on cp.id=ca.person_id
       left join mhistree.organizations o on o.id=c.organization_id
       where mhistree.canonical_person(e.person_id)=$1
       and (e.action in('record.read','file.read.authorized') or e.action like 'connection.%')
       and ($3::uuid is null or c.id=$3)
       and ($4::timestamptz is null or (e.recorded_at,e.id)<($4::timestamptz,$5::bigint))
       order by e.recorded_at desc,e.id desc limit 31`,
        [
          actor.personId,
          actor.accountId,
          data.connectionId ?? null,
          data.before?.at ?? null,
          data.before?.id ?? null,
        ],
      )
    ).rows;
    const items = rows.slice(0, 30),
      last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 30 ? { at: last!.recorded_at, id: last!.id } : null,
    };
  }, pool);
}
