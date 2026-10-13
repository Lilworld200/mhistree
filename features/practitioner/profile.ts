import "server-only";
import type { Pool, PoolClient } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { requireStaff } from "@/features/identity/server";
import { appendEvent } from "@/features/audit/server";
import { DomainError } from "@/lib/errors";
import { LocalPrivateStore } from "@/lib/storage/local";
export const clinicalPrivileges = [
  "records.read",
  "records.write",
  "appointments.manage",
  "messages.send",
  "requests.read",
  "requests.create",
  "results.finalize",
  "person.register",
  "person.lookup",
  "auth.activate",
] as const;
export async function requirePractitioner(
  tx: PoolClient,
  session: string,
  privilege = "records.read",
) {
  const actor = await verifySession(tx, session);
  const result = await tx.query(
    "select * from mhistree.professionals where account_id=$1 and status='approved' and $2=any(privileges) for share",
    [actor.accountId, privilege],
  );
  if (!result.rowCount) throw new DomainError("ACCESS_DENIED");
  return actor;
}
export async function professionalProfile(pool: Pool, session: string) {
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    const profile =
      (
        await tx.query(
          "select status,privileges,version from mhistree.professionals where account_id=$1",
          [actor.accountId],
        )
      ).rows[0] ?? null;
    const applications = (
      await tx.query(
        "select id,legal_name,profession,registration_number,jurisdiction,credential_name,submitted_at from mhistree.professional_applications where account_id=$1 order by submitted_at desc limit 10",
        [actor.accountId],
      )
    ).rows;
    return { profile, applications };
  }, pool);
}
export async function submitProfessional(
  pool: Pool,
  session: string,
  input: unknown,
  store = new LocalPrivateStore(),
) {
  const data = z
    .object({
      legalName: z.string().trim().min(2).max(200),
      profession: z.string().trim().min(2).max(100),
      registrationNumber: z.string().trim().min(1).max(100),
      jurisdiction: z.string().trim().min(2).max(100),
      filename: z.string().min(1).max(200),
      base64: z
        .string()
        .max(7 * 1024 * 1024)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      requestKey: z.uuid(),
    })
    .strict()
    .parse(input);
  const bytes = Buffer.from(data.base64, "base64");
  if (
    bytes.length < 5 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes.subarray(0, 5).toString() !== "%PDF-" ||
    /\/(JavaScript|JS|OpenAction|Launch|EmbeddedFile|Encrypt)\b/.test(
      bytes.toString("latin1"),
    )
  )
    throw new DomainError("ACCESS_DENIED");
  const hash = createHash("sha256").update(bytes).digest("hex");
  return transaction(async (tx) => {
    const actor = await verifySession(tx, session);
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `professional:${actor.accountId}`,
    ]);
    const existing = (
      await tx.query(
        "select * from mhistree.professional_applications where request_key=$1",
        [data.requestKey],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.account_id !== actor.accountId ||
        existing.credential_hash !== hash ||
        existing.legal_name !== data.legalName ||
        existing.registration_number !== data.registrationNumber ||
        existing.profession !== data.profession ||
        existing.jurisdiction !== data.jurisdiction
      )
        throw new DomainError("VERSION_CONFLICT");
      return { id: existing.id };
    }
    const current = (
      await tx.query(
        "select status from mhistree.professionals where account_id=$1 for update",
        [actor.accountId],
      )
    ).rows[0];
    if (current && ["approved", "suspended"].includes(current.status))
      throw new DomainError("ACCESS_DENIED");
    const key = randomUUID();
    await store.write(key, bytes);
    await tx.query(
      "insert into mhistree.professionals(account_id,status) values($1,'pending') on conflict(account_id) do update set status='pending',privileges='{}',version=mhistree.professionals.version+1",
      [actor.accountId],
    );
    const row = (
      await tx.query(
        "insert into mhistree.professional_applications(account_id,legal_name,profession,registration_number,jurisdiction,credential_key,credential_hash,credential_name,request_key) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id",
        [
          actor.accountId,
          data.legalName,
          data.profession,
          data.registrationNumber,
          data.jurisdiction,
          key,
          hash,
          data.filename,
          data.requestKey,
        ],
      )
    ).rows[0];
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: "professional.submitted",
      referenceId: row.id,
    });
    return row;
  }, pool);
}
async function reviewer(tx: PoolClient, session: string) {
  const actor = await verifySession(tx, session);
  await requireStaff(
    tx,
    { accountId: actor.accountId, contextId: "review:professionals" },
    "professional.review",
  );
  return actor;
}
export async function reviewQueue(pool: Pool, session: string) {
  return transaction(async (tx) => {
    await reviewer(tx, session);
    return (
      await tx.query(
        "select a.id,a.account_id,a.legal_name,a.profession,a.registration_number,a.jurisdiction,a.credential_name,a.submitted_at,p.status,p.version from mhistree.professional_applications a join mhistree.professionals p on p.account_id=a.account_id where a.id=(select id from mhistree.professional_applications where account_id=a.account_id order by submitted_at desc,id desc limit 1) order by a.submitted_at limit 100",
      )
    ).rows;
  }, pool);
}
export async function reviewProfessional(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      applicationId: z.uuid(),
      version: z.number().int().positive(),
      decision: z.enum(["approved", "rejected", "suspended"]),
      authorityUrl: z.url().refine((v) => new URL(v).protocol === "https:"),
      evidence: z.string().trim().min(20).max(3000),
      privileges: z.array(z.enum(clinicalPrivileges)).max(10),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await reviewer(tx, session);
    const row = (
      await tx.query(
        "select a.*,p.version from mhistree.professional_applications a join mhistree.professionals p on p.account_id=a.account_id where a.id=$1 for update of p",
        [d.applicationId],
      )
    ).rows[0];
    if (!row || row.account_id === actor.accountId)
      throw new DomainError("ACCESS_DENIED");
    const latest = (
      await tx.query(
        "select id from mhistree.professional_applications where account_id=$1 order by submitted_at desc,id desc limit 1",
        [row.account_id],
      )
    ).rows[0];
    if (row.version !== d.version || latest.id !== row.id)
      throw new DomainError("VERSION_CONFLICT");
    const privileges =
      d.decision === "approved" ? [...new Set(d.privileges)] : [];
    await tx.query(
      "insert into mhistree.professional_reviews(application_id,reviewer_account_id,decision,authority_url,evidence,privileges) values($1,$2,$3,$4,$5,$6)",
      [
        row.id,
        actor.accountId,
        d.decision,
        d.authorityUrl,
        d.evidence,
        privileges,
      ],
    );
    await tx.query(
      "update mhistree.professionals set status=$2,privileges=$3,version=version+1 where account_id=$1",
      [row.account_id, d.decision, privileges],
    );
    await tx.query(
      "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference,active) values($1,$2,$3,$4,$5) on conflict(account_id,context_id) do update set privileges=excluded.privileges,evidence_reference=excluded.evidence_reference,active=excluded.active",
      [
        row.account_id,
        `direct:${row.account_id}`,
        privileges.filter((p) =>
          ["person.register", "person.lookup", "auth.activate"].includes(p),
        ),
        `professional-review:${row.id}`,
        d.decision === "approved",
      ],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      action: `professional.${d.decision}`,
      referenceId: row.id,
    });
    return { status: d.decision };
  }, pool);
}
export async function credentialDownload(
  pool: Pool,
  session: string,
  id: string,
  store = new LocalPrivateStore(),
) {
  z.uuid().parse(id);
  const read = () =>
    transaction(async (tx) => {
      await reviewer(tx, session);
      const row = (
        await tx.query(
          "select credential_key,credential_hash from mhistree.professional_applications where id=$1",
          [id],
        )
      ).rows[0];
      if (!row) throw new DomainError("ACCESS_DENIED");
      return row;
    }, pool);
  const row = await read();
  const bytes = await store.read(row.credential_key);
  await read();
  if (createHash("sha256").update(bytes).digest("hex") !== row.credential_hash)
    throw new DomainError("ACCESS_DENIED");
  return bytes;
}
