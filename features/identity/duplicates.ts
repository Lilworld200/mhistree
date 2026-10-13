import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { requireStaff } from "./server";
import { identityReviewer } from "./assistance";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { digest } from "@/features/auth/sessions";

export async function duplicateSnapshot(
  tx: PoolClient,
  left: string,
  right: string,
) {
  const people = (
    await tx.query(
      "select id,created_at,canonical_person_id from mhistree.persons where id=any($1::uuid[]) order by id",
      [[left, right]],
    )
  ).rows;
  const accounts = (
    await tx.query(
      "select id,person_id,status,last_successful_patient_login_at from mhistree.accounts where person_id=any($1::uuid[]) and status<>'retired' order by id",
      [[left, right]],
    )
  ).rows;
  return { people, accounts };
}
export function chooseSurvivor(
  snapshot: Awaited<ReturnType<typeof duplicateSnapshot>>,
): string | null {
  if (
    snapshot.people.length !== 2 ||
    snapshot.people.some((p) => p.canonical_person_id)
  )
    return null;
  // Setup/recovery-pending ownership needs support resolution before reconciliation.
  if (snapshot.accounts.some((a) => a.status !== "active")) return null;
  if (snapshot.accounts.length === 1) return snapshot.accounts[0].person_id;
  if (snapshot.accounts.length === 0) {
    const p = [...snapshot.people].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return new Date(p[0].created_at).getTime() ===
      new Date(p[1].created_at).getTime()
      ? null
      : p[0].id;
  }
  if (
    snapshot.accounts.length !== 2 ||
    snapshot.accounts.some((a) => !a.last_successful_patient_login_at)
  )
    return null;
  const a = [...snapshot.accounts].sort(
    (a, b) =>
      new Date(b.last_successful_patient_login_at).getTime() -
      new Date(a.last_successful_patient_login_at).getTime(),
  );
  return new Date(a[0].last_successful_patient_login_at).getTime() ===
    new Date(a[1].last_successful_patient_login_at).getTime()
    ? null
    : a[0].person_id;
}
export async function flagDuplicate(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      personId: z.uuid(),
      candidateId: z.string().trim().min(1).max(80),
      reason: z.string().min(20).max(2000),
      staffContext: z.string().max(200).optional(),
    })
    .strict()
    .parse(input);
  if (d.personId === d.candidateId)
    throw new DomainError("IDENTITY_REVIEW_REQUIRED");
  await consumeAttempt(
    pool,
    "identity.duplicate.flag",
    digest(session),
    10,
    3600,
  );
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    if (actor.personId !== d.personId) {
      if (!d.staffContext) throw new DomainError("ACCESS_DENIED");
      await requireStaff(
        tx,
        { accountId: actor.accountId, contextId: d.staffContext },
        "person.lookup",
      );
    }
    const candidate = (
      await tx.query(
        "select id from mhistree.persons where id::text=$1 union select person_id id from mhistree.patient_identifiers where alias=$1 limit 1",
        [d.candidateId],
      )
    ).rows[0];
    if (!candidate) throw new DomainError("ACCESS_DENIED");
    if (candidate.id === d.personId)
      throw new DomainError("IDENTITY_REVIEW_REQUIRED");
    if (
      (
        await tx.query(
          "select id from mhistree.persons where id=any($1::uuid[])",
          [[d.personId, candidate.id]],
        )
      ).rowCount !== 2
    )
      throw new DomainError("ACCESS_DENIED");
    const row = (
      await tx.query(
        "insert into mhistree.duplicate_cases(left_person_id,right_person_id,reporter_account_id,reason) values($1,$2,$3,$4) returning id",
        [d.personId, candidate.id, actor.accountId, d.reason],
      )
    ).rows[0];
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "identity.duplicate.flagged",
      referenceId: row.id,
    });
    return row;
  }, pool);
}
export async function duplicateQueue(pool: Pool, session: string) {
  return transaction(async (tx) => {
    await identityReviewer(tx, session);
    return (
      await tx.query(
        "select c.*,l.display_name left_name,r.display_name right_name,l.birth_date left_birth_date,r.birth_date right_birth_date from mhistree.duplicate_cases c join mhistree.persons l on l.id=c.left_person_id join mhistree.persons r on r.id=c.right_person_id order by c.created_at,c.id limit 100",
      )
    ).rows;
  }, pool);
}
export async function duplicatePreview(
  pool: Pool,
  session: string,
  id: string,
) {
  z.uuid().parse(id);
  return transaction(async (tx) => {
    await identityReviewer(tx, session);
    const c = (
      await tx.query("select * from mhistree.duplicate_cases where id=$1", [id])
    ).rows[0];
    if (!c) throw new DomainError("ACCESS_DENIED");
    const snapshot = await duplicateSnapshot(
      tx,
      c.left_person_id,
      c.right_person_id,
    );
    const grants = (
      await tx.query(
        "select c.id,c.patient_person_id,c.kind,c.organization_id,c.status,s.categories,s.exclusions,s.origin_person_ids,s.origin_context_ids from mhistree.connections c left join lateral(select * from mhistree.consents where connection_id=c.id order by recorded_at desc,id desc limit 1)s on true where c.patient_person_id=any($1::uuid[]) order by c.id",
        [[c.left_person_id, c.right_person_id]],
      )
    ).rows;
    return {
      survivorId: chooseSurvivor(snapshot),
      snapshot,
      grants,
      rule: "Sole activated identity; otherwise oldest; if both activated, latest successful patient login. Tied or missing evidence requires support review.",
    };
  }, pool);
}
export async function reviewDuplicate(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      decision: z.enum(["approved", "rejected", "escalated"]),
      identityEvidence: z.string().min(20).max(3000),
      ownershipVerified: z.boolean(),
      expectedSurvivorId: z.uuid().nullable(),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await identityReviewer(tx, session),
      c = (
        await tx.query(
          "select * from mhistree.duplicate_cases where id=$1 for update",
          [d.id],
        )
      ).rows[0];
    if (
      !c ||
      c.reporter_account_id === actor.accountId ||
      [c.left_person_id, c.right_person_id].includes(actor.personId)
    )
      throw new DomainError("ACCESS_DENIED");
    if (c.version !== d.version || !["pending", "escalated"].includes(c.state))
      throw new DomainError("VERSION_CONFLICT");
    const snapshot = await duplicateSnapshot(
        tx,
        c.left_person_id,
        c.right_person_id,
      ),
      survivor = chooseSurvivor(snapshot);
    if (
      d.decision === "approved" &&
      (!d.ownershipVerified || !survivor || d.expectedSurvivorId !== survivor)
    )
      throw new DomainError("IDENTITY_REVIEW_REQUIRED");
    await tx.query(
      "insert into mhistree.duplicate_decisions(case_id,reviewer_account_id,decision,identity_evidence,ownership_verified,survivor_id,snapshot) values($1,$2,$3,$4,$5,$6,$7)",
      [
        d.id,
        actor.accountId,
        d.decision,
        d.identityEvidence,
        d.ownershipVerified,
        survivor,
        JSON.stringify(snapshot),
      ],
    );
    await tx.query(
      "update mhistree.duplicate_cases set state=$2,version=version+1 where id=$1",
      [d.id, d.decision],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      referenceId: d.id,
      action: "identity.duplicate.reviewed",
    });
    return { survivorId: survivor, state: d.decision };
  }, pool);
}
