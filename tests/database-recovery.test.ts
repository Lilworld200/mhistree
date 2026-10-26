import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EventEmitter } from "node:events";
import { acquireConnection, transaction } from "@/lib/db/client";
import { withCredentialLock } from "@/features/auth/credential-lock";
import { databaseDebug } from "@/lib/db/diagnostics";
function client() {
  return Object.assign(new EventEmitter(), {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  });
}
function pool(c = client()) {
  return Object.assign(new EventEmitter(), {
    connect: vi.fn().mockResolvedValue(c),
    totalCount: 1,
    idleCount: 0,
    waitingCount: 0,
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("retries a transient acquisition once before BEGIN and runs transaction work only once", async () => {
  const c = client(),
    p = pool(c),
    work = vi.fn().mockResolvedValue("saved");
  p.connect.mockRejectedValueOnce(
    Object.assign(new Error("private connection details"), {
      code: "ECONNRESET",
    }),
  );
  expect(await transaction(work, p as unknown as Pool)).toBe("saved");
  expect(p.connect).toHaveBeenCalledTimes(2);
  expect(work).toHaveBeenCalledTimes(1);
  expect(c.query.mock.calls.map((v) => v[0])).toEqual(["begin", "commit"]);
});
it("saturation and invalid authentication are not retried; persistent failure stops after two attempts", async () => {
  for (const failure of [
    new Error("timeout exceeded when trying to connect"),
    Object.assign(new Error("secret"), { code: "28P01" }),
  ]) {
    const p = pool();
    p.connect.mockRejectedValue(failure);
    await expect(acquireConnection(p as unknown as Pool)).rejects.toThrow(
      "DATABASE_UNAVAILABLE",
    );
    expect(p.connect).toHaveBeenCalledTimes(1);
  }
  const p = pool();
  p.connect.mockRejectedValue(
    Object.assign(new Error("network"), { code: "ETIMEDOUT" }),
  );
  await expect(acquireConnection(p as unknown as Pool)).rejects.toThrow(
    "DATABASE_UNAVAILABLE",
  );
  expect(p.connect).toHaveBeenCalledTimes(2);
});
it("a mid-transaction failure is never replayed; failed rollback destroys the client and preserves the original error", async () => {
  const c = client(),
    p = pool(c),
    failure = new Error("original clinical failure"),
    work = vi.fn().mockRejectedValue(failure);
  c.query.mockImplementation(async (sql) => {
    if (sql === "rollback") throw new Error("cleanup failure");
    return { rows: [] };
  });
  await expect(transaction(work, p as unknown as Pool)).rejects.toBe(failure);
  expect(work).toHaveBeenCalledTimes(1);
  expect(p.connect).toHaveBeenCalledTimes(1);
  expect(c.release).toHaveBeenCalledWith(true);
});
it("both failed work and failed unlock preserve the work error, while always discarding the lock session", async () => {
  const c = client(),
    locks = pool(c),
    data = pool(),
    failure = new Error("original provider failure");
  c.query.mockImplementation(async (sql) => {
    if (sql.includes("pg_advisory_unlock")) throw new Error("unlock failure");
    return { rows: [] };
  });
  await expect(
    withCredentialLock(
      data as unknown as Pool,
      locks as unknown as Pool,
      "synthetic",
      async () => {
        throw failure;
      },
    ),
  ).rejects.toBe(failure);
  expect(c.release).toHaveBeenCalledWith(true);
});
it("unlock failure after successful work is reported and never returns a locked session to the pool", async () => {
  const c = client(),
    locks = pool(c);
  c.query.mockImplementation(async (sql) => {
    if (sql.includes("pg_advisory_unlock")) throw new Error("unlock failure");
    return { rows: [] };
  });
  await expect(
    withCredentialLock(
      pool() as unknown as Pool,
      locks as unknown as Pool,
      "synthetic",
      async () => "done",
    ),
  ).rejects.toThrow("unlock failure");
  expect(c.release).toHaveBeenCalledWith(true);
  await expect(
    withCredentialLock(
      locks as unknown as Pool,
      locks as unknown as Pool,
      "synthetic",
      async () => "done",
    ),
  ).rejects.toThrow("separate connection pool");
});
it("diagnostics contain counters/codes but exclude credentials, patient text and raw error payloads", () => {
  vi.stubEnv("DB_DEBUG", "1");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  databaseDebug(
    "checkout.failed",
    pool() as unknown as Pool,
    12,
    Object.assign(new Error("private@example.com secret patient text"), {
      code: "ECONNRESET",
      detail: "password",
    }),
  );
  const output = JSON.stringify(log.mock.calls);
  expect(output).toContain("ECONNRESET");
  expect(output).not.toMatch(/private@example|password|secret|patient text/);
  vi.stubEnv("DB_DEBUG", "0");
  log.mockClear();
  databaseDebug("checkout", pool() as unknown as Pool);
  expect(log).not.toHaveBeenCalled();
});
