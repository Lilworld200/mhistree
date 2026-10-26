import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { signupEmail } from "@/features/auth/email";
import { secret } from "@/features/auth/sessions";
import type { SupabaseProvider } from "@/lib/auth/supabase";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
it("eight signups with provider latency cannot hold the data pool while waiting for nested queries", async () => {
  let activeProvider = 0,
    peak = 0;
  const provider = {
    signup: async () => {
      activeProvider++;
      peak = Math.max(peak, activeProvider);
      try {
        await db.pool.query("select 1");
        await new Promise((r) => setTimeout(r, 20));
        return randomUUID();
      } finally {
        activeProvider--;
      }
    },
  } as unknown as SupabaseProvider;
  process.env.APP_ORIGIN = "http://127.0.0.1:3101";
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      signupEmail(
        db.pool,
        db.lockPool,
        provider,
        {
          email: `synthetic-${randomUUID()}@example.test`,
          password: "Synthetic-password-123!",
          displayName: "Synthetic pool test",
          requestKey: secret(),
        },
        randomUUID(),
      ),
    ),
  );
  expect(results.every((r) => r.verificationRequired)).toBe(true);
  expect(peak).toBeLessThanOrEqual(2);
  expect(peak).toBeGreaterThan(0);
  expect(db.lockPool.totalCount).toBe(db.lockPool.idleCount);
  expect(db.pool.totalCount).toBe(db.pool.idleCount);
  expect(db.pool.options.max).toBe(6);
  expect(db.lockPool.options.max).toBe(2);
});
