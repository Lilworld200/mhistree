import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { testDatabase } from "../helpers/postgres";
import { database, credentialLockDatabase, transaction } from "@/lib/db/client";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
  const config = db.pool.options;
  vi.stubEnv(
    "DATABASE_URL",
    `postgresql://${config.user}:${encodeURIComponent(String(config.password))}@127.0.0.1:${config.port}/${config.database}`,
  );
  vi.stubEnv("DATABASE_SSL", "local");
});
afterAll(async () => {
  await Promise.all([database().end(), credentialLockDatabase().end()]);
  delete (
    globalThis as typeof globalThis & { __mhistreeDatabasePools?: unknown }
  ).__mhistreeDatabasePools;
  await db?.stop();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("a dropped idle backend is handled, discarded and replaced by a working connection", async () => {
  const pool = database(),
    locks = credentialLockDatabase();
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const client = await pool.connect();
  const pid = (await client.query("select pg_backend_pid() id")).rows[0].id;
  client.release();
  await locks.query("select pg_terminate_backend($1)", [pid]);
  await vi.waitFor(() => expect(pool.totalCount).toBe(0));
  expect(JSON.stringify(log.mock.calls)).toContain("data.idle-error");
  const result = await transaction((tx) => tx.query("select 1 value"), pool);
  expect(result.rows[0].value).toBe(1);
});
it("a dropped active backend fails its transaction once and a later independent transaction succeeds", async () => {
  let calls = 0;
  await expect(
    transaction(async (tx) => {
      calls++;
      const pid = (await tx.query("select pg_backend_pid() id")).rows[0].id;
      await credentialLockDatabase().query("select pg_terminate_backend($1)", [
        pid,
      ]);
      await tx.query("select 1");
    }, database()),
  ).rejects.toThrow();
  expect(calls).toBe(1);
  const result = await transaction(
    (tx) => tx.query("select 1 value"),
    database(),
  );
  expect(result.rows[0].value).toBe(1);
});
