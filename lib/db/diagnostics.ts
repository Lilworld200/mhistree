import "server-only";
import type { Pool } from "pg";
/** Deliberately excludes SQL, connection strings, patient data and raw errors. */
export function databaseDebug(
  event: string,
  pool: Pool,
  elapsedMs?: number,
  error?: unknown,
  force = false,
) {
  if (!force && process.env.DB_DEBUG !== "1") return;
  const code = (error as { code?: unknown } | null)?.code;
  console.info(
    "[MHISTREE DB]",
    JSON.stringify({
      event,
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
      ...(elapsedMs !== undefined ? { elapsedMs: Math.round(elapsedMs) } : {}),
      ...(typeof code === "string" && /^[A-Z0-9_]{2,32}$/.test(code)
        ? { code }
        : {}),
    }),
  );
}
