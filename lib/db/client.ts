import "server-only";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { databaseEnvironment } from "../env";
import { createHash } from "node:crypto";
import { DomainError } from "../errors";
import { databaseDebug } from "./diagnostics";
type Pools = { fingerprint: string; data: Pool; locks: Pool };
const registry = globalThis as typeof globalThis & {
  __mhistreeDatabasePools?: Pools;
};
const healthKey = Symbol.for("mhistree.database.client-health");
type MonitoredClient = PoolClient & { [healthKey]?: { broken: boolean } };
function monitorClient(client: MonitoredClient, pool: Pool) {
  if (client[healthKey]) return;
  const health = { broken: false };
  client[healthKey] = health;
  // Keep this listener for the physical client's lifetime, including the small
  // gaps between awaited queries and socket teardown after release(true).
  client.on("error", (error) => {
    health.broken = true;
    databaseDebug("client.error", pool, undefined, error, true);
  });
  client.once("end", () => {
    health.broken = true;
  });
}
export function releaseConnection(client: PoolClient, destroy = false) {
  client.release(
    destroy || Boolean((client as MonitoredClient)[healthKey]?.broken),
  );
}
function pools() {
  const env = databaseEnvironment();
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(env))
    .digest("hex");
  if (registry.__mhistreeDatabasePools) {
    if (registry.__mhistreeDatabasePools.fingerprint !== fingerprint)
      throw new DomainError("CONFIGURATION_REQUIRED"); // Restart after connection configuration changes.
    return registry.__mhistreeDatabasePools;
  }
  const config = {
    connectionString: env.DATABASE_URL,
    ssl:
      env.DATABASE_SSL === "local"
        ? false
        : {
            rejectUnauthorized: true,
            ...(env.DATABASE_SSL_CA_FILE
              ? { ca: readFileSync(env.DATABASE_SSL_CA_FILE, "utf8") }
              : {}),
          },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  };
  function create(kind: "data" | "locks", max: number) {
    const pool = new Pool({
      ...config,
      max,
      application_name: `mhistree:${kind}`,
    });
    pool.on("connect", (client) => {
      monitorClient(client, pool);
      databaseDebug(`${kind}.connected`, pool);
    });
    pool.on("remove", () => databaseDebug(`${kind}.removed`, pool));
    // pg discards the broken idle client. Handle the event so it cannot crash the process.
    pool.on("error", (error) =>
      databaseDebug(`${kind}.idle-error`, pool, undefined, error, true),
    );
    return pool;
  }
  return (registry.__mhistreeDatabasePools = {
    fingerprint,
    data: create("data", 6),
    locks: create("locks", 2),
  });
}
export function database() {
  return pools().data;
}
export function credentialLockDatabase() {
  return pools().locks;
}

export async function acquireConnection(pool: Pool): Promise<PoolClient> {
  const started = performance.now();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const client = await pool.connect();
      monitorClient(client, pool);
      databaseDebug("checkout", pool, performance.now() - started);
      return client;
    } catch (error) {
      databaseDebug(
        "checkout.failed",
        pool,
        performance.now() - started,
        error,
      );
      const code = (error as { code?: string }).code;
      const message = error instanceof Error ? error.message : "";
      const transient =
        [
          "ECONNRESET",
          "ECONNREFUSED",
          "ETIMEDOUT",
          "EPIPE",
          "EAI_AGAIN",
          "08006",
        ].includes(code ?? "") ||
        message === "Connection terminated due to connection timeout";
      // Queue saturation isn't a new-connection failure. Never replay transaction work.
      if (
        attempt ||
        !transient ||
        /timeout exceeded when trying to connect/.test(message)
      )
        throw new DomainError("DATABASE_UNAVAILABLE");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new DomainError("DATABASE_UNAVAILABLE");
}
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
  source: Pool = database(),
): Promise<T> {
  const client = await acquireConnection(source);
  let destroy = false,
    begun = false;
  try {
    await client.query("begin");
    begun = true;
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    if (begun) {
      try {
        await client.query("rollback");
      } catch {
        destroy = true;
      }
    } else destroy = true;
    throw error;
  } finally {
    releaseConnection(client, destroy);
  }
}
