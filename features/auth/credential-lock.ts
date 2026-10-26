import "server-only";
import type { Pool } from "pg";
import { acquireConnection, releaseConnection } from "@/lib/db/client";
/** Session-mode pool only. Ordinary work must use a different pool. */
export async function withCredentialLock<T>(
  data: Pool,
  locks: Pool,
  key: string,
  work: () => Promise<T>,
) {
  if (data === locks)
    throw new Error("Credential locks require a separate connection pool");
  const client = await acquireConnection(locks);
  let failed = false,
    destroy = false,
    locked = false;
  try {
    await client.query("select pg_advisory_lock(hashtextextended($1,0))", [
      key,
    ]);
    locked = true;
    return await work();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      if (locked)
        await client.query(
          "select pg_advisory_unlock(hashtextextended($1,0))",
          [key],
        );
      else destroy = true;
    } catch (error) {
      destroy = true;
      if (!failed) throw error;
    } finally {
      releaseConnection(client, destroy);
    }
  }
}
