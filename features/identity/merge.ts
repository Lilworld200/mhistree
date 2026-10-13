import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { identityReviewer } from "./assistance";
import { chooseSurvivor, duplicateSnapshot } from "./duplicates";
import { appendEvent } from "@/features/audit/server";
import { digest } from "@/features/auth/sessions";
import { DomainError } from "@/lib/errors";

function fingerprint(s: Awaited<ReturnType<typeof duplicateSnapshot>>) {
  return JSON.stringify([
    s.people.map((p) => [
      p.id,
      new Date(p.created_at).toISOString(),
      p.canonical_person_id,
    ]),
    s.accounts.map((a) => [
      a.id,
      a.person_id,
      a.status,
      a.last_successful_patient_login_at
        ? new Date(a.last_successful_patient_login_at).toISOString()
        : null,
    ]),
  ]);
}
async function invalidate(tx: PoolClient, people: string[], operation: string) {
  await tx.query(
    "update mhistree.connections set revision=revision+1 where patient_person_id=any($1::uuid[])",
    [people],
  );
  await tx.query(
    "update mhistree.clinical_work set state='paused',version=version+1,updated_at=clock_timestamp() where patient_person_id=any($1::uuid[]) and state='draft'",
    [people],
  );
  await tx.query(
    "update mhistree.chat_generations set state='cancelled',lease_id=null,lease_until=null,updated_at=clock_timestamp() where message_id in(select id from mhistree.chat_messages where person_id=any($1::uuid[])) and state in('queued','running')",
    [people],
  );
  await tx.query(
    "insert into mhistree.outbox(kind,reference_id) values('identity.mapping.invalidated',$1) on conflict do nothing",
    [operation],
  );
}
export async function mergeIdentities(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      caseId: z.uuid(),
      operationId: z.uuid(),
      version: z.number().int().positive(),
      expectedSurvivorId: z.uuid(),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await identityReviewer(tx, session);
    await tx.query(
      "select pg_advisory_xact_lock(hashtextextended('identity-mapping',0))",
    );
    const replay = (
      await tx.query(
        "select * from mhistree.merge_journal where operation_id=$1",
        [d.operationId],
      )
    ).rows[0];
    if (replay) {
      if (
        replay.case_id !== d.caseId ||
        replay.survivor_id !== d.expectedSurvivorId
      )
        throw new DomainError("VERSION_CONFLICT");
      return {
        operationId: d.operationId,
        survivorId: replay.survivor_id,
        loserId: replay.loser_id,
        replayed: true,
      };
    }
    const c = (
      await tx.query(
        "select * from mhistree.duplicate_cases where id=$1 for update",
        [d.caseId],
      )
    ).rows[0];
    if (!c || c.state !== "approved" || c.version !== d.version)
      throw new DomainError("VERSION_CONFLICT");
    const people = [c.left_person_id, c.right_person_id].sort();
    if (people.includes(actor.personId)) throw new DomainError("ACCESS_DENIED");
    for (const id of people)
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `auth:${id}`,
      ]);
    await tx.query(
      "select id from mhistree.persons where id=any($1::uuid[]) order by id for update",
      [people],
    );
    await tx.query(
      "select id from mhistree.accounts where person_id=any($1::uuid[]) order by id for update",
      [people],
    );
    const decision = (
      await tx.query(
        "select * from mhistree.duplicate_decisions where case_id=$1 order by recorded_at desc,id desc limit 1",
        [c.id],
      )
    ).rows[0];
    const snapshot = await duplicateSnapshot(
        tx,
        c.left_person_id,
        c.right_person_id,
      ),
      survivor = chooseSurvivor(snapshot);
    if (
      !decision ||
      decision.decision !== "approved" ||
      !decision.ownership_verified ||
      !survivor ||
      survivor !== d.expectedSurvivorId ||
      survivor !== decision.survivor_id ||
      fingerprint(snapshot) !== fingerprint(decision.snapshot)
    )
      throw new DomainError("IDENTITY_REVIEW_REQUIRED");
    const loser = people.find((id) => id !== survivor)!;
    const partitions = (
      await tx.query(
        "select id from mhistree.persons where mhistree.canonical_person(id)=any($1::uuid[]) order by id",
        [people],
      )
    ).rows.map((r) => r.id as string);
    await tx.query(
      "select id from mhistree.connections where patient_person_id=any($1::uuid[]) order by id for update",
      [partitions],
    );
    const grants = (
      await tx.query(
        "select c.*,s.id consent_id,s.categories,s.exclusions,s.origin_person_ids,s.origin_context_ids from mhistree.connections c left join lateral(select * from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s on true where c.patient_person_id=any($1::uuid[]) order by c.id",
        [partitions],
      )
    ).rows;
    await tx.query(
      "insert into mhistree.merge_journal(operation_id,case_id,decision_id,survivor_id,loser_id,reviewer_account_id,before_state) values($1,$2,$3,$4,$5,$6,$7)",
      [
        d.operationId,
        c.id,
        decision.id,
        survivor,
        loser,
        actor.accountId,
        JSON.stringify({ snapshot, partitions, grants }),
      ],
    );
    await tx.query(
      "update mhistree.persons set canonical_person_id=$2,merge_operation_id=$3 where id=$1",
      [loser, survivor, d.operationId],
    );
    await tx.query(
      "update mhistree.accounts set status='retired',session_epoch=session_epoch+1 where person_id=$1 and status<>'retired'",
      [loser],
    );
    await tx.query(
      "update mhistree.sessions set retired_at=clock_timestamp() where account_id in(select id from mhistree.accounts where person_id=$1) and retired_at is null",
      [loser],
    );
    await tx.query(
      "update mhistree.setup_credentials set state='replaced' where person_id=$1",
      [loser],
    );
    await tx.query(
      "update mhistree.setup_sessions set used_at=clock_timestamp() where credential_id in(select id from mhistree.setup_credentials where person_id=$1) and used_at is null",
      [loser],
    );
    await tx.query(
      "insert into mhistree.auth_reconciliation(person_id,operation) select $1,'revoke-provider-sessions' where exists(select 1 from mhistree.accounts where person_id=$1) on conflict(person_id) do update set pending=true,operation=excluded.operation,updated_at=clock_timestamp()",
      [loser],
    );
    await invalidate(tx, partitions, d.operationId);
    await tx.query(
      "update mhistree.duplicate_cases set state='merged',version=version+1 where id=$1",
      [c.id],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: survivor,
      referenceId: d.operationId,
      action: "identity.merged",
    });
    return {
      operationId: d.operationId,
      survivorId: survivor,
      loserId: loser,
      replayed: false,
    };
  }, pool);
}

async function reversalInventory(
  tx: PoolClient,
  journal: { survivor_id: string; loser_id: string; recorded_at: Date },
) {
  const people = [journal.survivor_id, journal.loser_id];
  // IDs and versions make the review token change when later records or consent change.
  const records = (
    await tx.query(
      "select id,patient_person_id,origin_person_id,version,supersedes_id from mhistree.contributions where mhistree.canonical_person(patient_person_id)=mhistree.canonical_person($1) and recorded_at>$2 order by id",
      [journal.survivor_id, journal.recorded_at],
    )
  ).rows;
  const consents = (
    await tx.query(
      "select s.id,s.connection_id,s.origin_person_ids,s.origin_context_ids from mhistree.consents s join mhistree.connections c on c.id=s.connection_id where mhistree.canonical_person(c.patient_person_id)=mhistree.canonical_person($1) and s.recorded_at>$2 order by s.id",
      [journal.survivor_id, journal.recorded_at],
    )
  ).rows;
  const mappings = (
    await tx.query(
      "select id,canonical_person_id,merge_operation_id from mhistree.persons where id=any($1::uuid[]) order by id",
      [people],
    )
  ).rows;
  return { records, consents, mappings };
}
export async function previewReversal(
  pool: Pool,
  session: string,
  operationId: string,
) {
  z.uuid().parse(operationId);
  return transaction(async (tx) => {
    await identityReviewer(tx, session);
    const j = (
      await tx.query(
        "select * from mhistree.merge_journal where operation_id=$1",
        [operationId],
      )
    ).rows[0];
    if (!j) throw new DomainError("ACCESS_DENIED");
    const inventory = await reversalInventory(tx, j);
    return {
      operationId,
      survivorId: j.survivor_id,
      loserId: j.loser_id,
      inventory,
      reviewToken: digest(JSON.stringify(inventory)),
      disposition:
        "Each original and later contribution remains with its recorded origin identity. Consent stays on its original connection; paused work stays paused; retired credentials remain retired.",
    };
  }, pool);
}
export async function reverseMerge(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      mergeOperationId: z.uuid(),
      operationId: z.uuid(),
      reviewToken: z.string().length(64),
      evidence: z.string().min(20).max(3000),
      reviewedLaterWork: z.literal(true),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await identityReviewer(tx, session);
    await tx.query(
      "select pg_advisory_xact_lock(hashtextextended('identity-mapping',0))",
    );
    const replay = (
      await tx.query(
        "select merge_operation_id from mhistree.merge_reversals where operation_id=$1",
        [d.operationId],
      )
    ).rows[0];
    if (replay) {
      if (replay.merge_operation_id !== d.mergeOperationId)
        throw new DomainError("VERSION_CONFLICT");
      return { reversed: true, replayed: true };
    }
    const j = (
      await tx.query(
        "select * from mhistree.merge_journal where operation_id=$1",
        [d.mergeOperationId],
      )
    ).rows[0];
    if (!j) throw new DomainError("ACCESS_DENIED");
    // Prevent writes while the reviewed inventory and mappings are reconciled.
    await tx.query(
      "lock table mhistree.contributions,mhistree.sources,mhistree.consents,mhistree.connections in share row exclusive mode",
    );
    const people = [j.survivor_id, j.loser_id].sort();
    if (people.includes(actor.personId)) throw new DomainError("ACCESS_DENIED");
    await tx.query(
      "select id from mhistree.persons where id=any($1::uuid[]) order by id for update",
      [people],
    );
    const inventory = await reversalInventory(tx, j),
      loser = inventory.mappings.find((p) => p.id === j.loser_id),
      survivor = inventory.mappings.find((p) => p.id === j.survivor_id);
    if (
      loser?.canonical_person_id !== j.survivor_id ||
      loser?.merge_operation_id !== j.operation_id ||
      survivor?.canonical_person_id ||
      digest(JSON.stringify(inventory)) !== d.reviewToken
    )
      throw new DomainError("VERSION_CONFLICT");
    // A later explicit grant spanning both identities cannot silently survive separation.
    if (
      inventory.consents.some(
        (s) =>
          s.origin_person_ids.includes(j.loser_id) &&
          s.origin_person_ids.includes(j.survivor_id),
      )
    )
      throw new DomainError("IDENTITY_REVIEW_REQUIRED");
    await tx.query(
      "insert into mhistree.merge_reversals(operation_id,merge_operation_id,reviewer_account_id,evidence,after_merge_inventory) values($1,$2,$3,$4,$5)",
      [
        d.operationId,
        j.operation_id,
        actor.accountId,
        d.evidence,
        JSON.stringify(inventory),
      ],
    );
    await tx.query(
      "update mhistree.persons set canonical_person_id=null,merge_operation_id=null where id=$1",
      [j.loser_id],
    );
    await invalidate(tx, j.before_state.partitions, d.operationId);
    await tx.query(
      "update mhistree.duplicate_cases set state='reversed',version=version+1 where id=$1",
      [j.case_id],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      referenceId: d.operationId,
      action: "identity.merge.reversed",
    });
    return { reversed: true, replayed: false };
  }, pool);
}
