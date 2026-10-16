import "server-only";
import { readFileSync } from "node:fs";
import { Pool, type PoolClient } from "pg";
import { databaseEnvironment } from "../env";
let pool: Pool | undefined;
export function database() {
  const env = databaseEnvironment();
  return (pool ??= new Pool({
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
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  }));
}
export async function transaction<T>(
  work: (client: PoolClient) => Promise<T>,
  source: Pool = database(),
): Promise<T> {
  const client = await source.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
