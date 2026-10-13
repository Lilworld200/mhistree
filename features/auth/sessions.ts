import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { DomainError } from "@/lib/errors";
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export type VerifiedSession = {
  accountId: string;
  personId: string;
  sessionId: string;
  epoch: number;
};

/** Opaque session is accepted only after a provider-signed login; each use checks current retirement/epoch. */
export async function verifySession(
  tx: PoolClient,
  token: string,
): Promise<VerifiedSession> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new DomainError("AUTH_REQUIRED");
  const result = await tx.query(
    `select a.id,a.person_id,a.session_epoch,s.id session_id from mhistree.sessions s join mhistree.accounts a on a.id=s.account_id
    where s.digest=$1 and s.retired_at is null and s.expires_at>clock_timestamp() and s.session_epoch=a.session_epoch and a.status='active' for share of s,a`,
    [digest(token)],
  );
  if (!result.rowCount) throw new DomainError("SESSION_RETIRED");
  const row = result.rows[0];
  return {
    accountId: row.id,
    personId: row.person_id,
    sessionId: row.session_id,
    epoch: row.session_epoch,
  };
}
