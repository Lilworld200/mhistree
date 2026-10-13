import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { digest } from "@/features/auth/sessions";
import { requirePractitioner } from "./profile";
import { registerPerson, lookupPeople } from "@/features/identity/server";
import { category } from "@/features/health-records/schema";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
export async function directPatients(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await requirePractitioner(tx, session);
    return (
      await tx.query(
        "select c.id,c.patient_person_id,c.status,c.revision,p.display_name,p.birth_date,s.categories,s.exclusions,s.method from mhistree.connections c join mhistree.persons p on p.id=c.patient_person_id left join lateral(select categories,exclusions,method from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s on true where c.kind='direct' and c.practitioner_account_id=$1 order by p.display_name,c.id limit 100",
        [actor.accountId],
      )
    ).rows;
  }, pool);
}
export async function practitionerLookup(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const data = z
    .union([
      z.object({ exactAlias: z.string().min(1).max(80) }).strict(),
      z.object({ namePrefix: z.string().min(3).max(80) }).strict(),
    ])
    .parse(input);
  const actor = await transaction(
    (tx) => requirePractitioner(tx, session, "person.lookup"),
    pool,
  );
  return lookupPeople(pool, session, `direct:${actor.accountId}`, data);
}
export async function registerDirectPatient(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const actor = await transaction(
    (tx) => requirePractitioner(tx, session, "person.register"),
    pool,
  );
  return registerPerson(pool, session, `direct:${actor.accountId}`, input);
}
export async function initiateDirectConnection(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      patientPersonId: z.uuid(),
      requestKey: z.uuid(),
      method: z.enum(["login", "in-person"]),
      categories: z.array(category).min(1).max(10),
      exclusions: z.array(category).max(10),
      evidence: z.string().trim().min(20).max(2000).optional(),
    })
    .strict()
    .refine((v) => v.method !== "in-person" || Boolean(v.evidence))
    .parse(input);
  if (d.exclusions.some((c) => !d.categories.includes(c)))
    throw new DomainError("ACCESS_DENIED");
  return transaction(async (tx) => {
    const actor = await requirePractitioner(tx, session, "records.write");
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `direct:${actor.accountId}:${d.patientPersonId}`,
    ]);
    const hash = digest(JSON.stringify(d));
    const replay = (
      await tx.query(
        "select * from mhistree.direct_connection_operations where request_key=$1",
        [d.requestKey],
      )
    ).rows[0];
    if (replay) {
      if (
        replay.actor_account_id !== actor.accountId ||
        replay.body_hash !== hash
      )
        throw new DomainError("VERSION_CONFLICT");
      return { id: replay.connection_id, replayed: true };
    }
    if (
      !(
        await tx.query("select 1 from mhistree.persons where id=$1", [
          d.patientPersonId,
        ])
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    let connection = (
      await tx.query(
        "select * from mhistree.connections where patient_person_id=$1 and practitioner_account_id=$2 and kind='direct' order by id limit 1 for update",
        [d.patientPersonId, actor.accountId],
      )
    ).rows[0];
    if (connection && connection.status !== "revoked")
      throw new DomainError("VERSION_CONFLICT");
    const previous = connection
      ? (
          await tx.query(
            "select * from mhistree.consents where connection_id=$1 order by recorded_at desc,id desc limit 1",
            [connection.id],
          )
        ).rows[0]
      : null;
    const state = d.method === "login" ? "pending" : "active";
    if (connection) {
      connection = (
        await tx.query(
          "update mhistree.connections set status=$2,revision=revision+1 where id=$1 returning *",
          [connection.id, state],
        )
      ).rows[0];
    } else
      connection = (
        await tx.query(
          "insert into mhistree.connections(patient_person_id,kind,practitioner_account_id,status) values($1,'direct',$2,$3) returning *",
          [d.patientPersonId, actor.accountId, state],
        )
      ).rows[0];
    await tx.query(
      "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id,evidence_reference,predecessor_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        connection.id,
        d.categories,
        d.exclusions,
        previous?.origin_person_ids ?? [d.patientPersonId],
        previous?.origin_context_ids ?? ["*"],
        d.method,
        actor.accountId,
        d.evidence ?? null,
        previous?.id ?? null,
      ],
    );
    await tx.query(
      "insert into mhistree.direct_connection_operations values($1,$2,$3,$4)",
      [d.requestKey, actor.accountId, connection.id, hash],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: d.patientPersonId,
      action: "connection.consent.updated",
      contextId: `direct:${connection.id}`,
      referenceId: connection.id,
    });
    return { id: connection.id, status: state, replayed: false };
  }, pool);
}
