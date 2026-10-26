import { afterEach, expect, it, vi } from "vitest";
vi.mock("pg", async () => {
  const { EventEmitter } = await import("node:events");
  class Pool extends EventEmitter {
    totalCount = 0;
    idleCount = 0;
    waitingCount = 0;
    constructor(public options: Record<string, unknown>) {
      super();
    }
  }
  return { Pool };
});
afterEach(() => {
  delete (
    globalThis as typeof globalThis & { __mhistreeDatabasePools?: unknown }
  ).__mhistreeDatabasePools;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});
it("reuses both pools across module reloads with a six-plus-two connection budget", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://localhost/synthetic");
  vi.stubEnv("DATABASE_SSL", "local");
  const first = await import("@/lib/db/client");
  const data = first.database(),
    locks = first.credentialLockDatabase();
  expect(data.options.max).toBe(6);
  expect(locks.options.max).toBe(2);
  expect(data).not.toBe(locks);
  vi.resetModules();
  const second = await import("@/lib/db/client");
  expect(second.database()).toBe(data);
  expect(second.credentialLockDatabase()).toBe(locks);
  expect(data.listenerCount("error")).toBe(1);
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  expect(() =>
    data.emit(
      "error",
      Object.assign(new Error("secret connection string"), {
        code: "ECONNRESET",
      }),
    ),
  ).not.toThrow();
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "secret connection string",
  );
  vi.stubEnv("DATABASE_URL", "postgres://localhost/changed");
  expect(() => second.database()).toThrow("CONFIGURATION_REQUIRED");
});
