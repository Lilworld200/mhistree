import "server-only";
import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { DomainError } from "@/lib/errors";

/** Own committed statement: failed operations must still consume their attempt. */
export async function consumeAttempt(
  pool: Pool,
  scope: string,
  key: string,
  limit: number,
  seconds = 60,
) {
  const bucket = `${scope}:${createHash("sha256").update(key).digest("hex")}`;
  const { rows } = await pool.query<{ attempts: number }>(
    `insert into mhistree.rate_limits(bucket,window_start,attempts)
    values($1,to_timestamp(floor(extract(epoch from clock_timestamp()) / $2) * $2),1)
    on conflict(bucket,window_start) do update set attempts=mhistree.rate_limits.attempts+1 returning attempts`,
    [bucket, seconds],
  );
  if (rows[0].attempts > limit) throw new DomainError("RATE_LIMITED");
}
