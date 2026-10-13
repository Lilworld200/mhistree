import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { timeline, sourcePreview } from "@/features/health-records/timeline";
describe("timeline snapshot and source access", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    other: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  async function add(occurredAt: unknown) {
    const source = await recordSource(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        patientPersonId: patient.personId,
        category: "symptom",
        sourceTimezone: "UTC",
        content: "Synthetic left leg pain",
        clientKey: randomUUID(),
      },
    );
    return acceptContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        sourceId: source.sourceId,
        sourceVersion: 1,
        sourceItemId: "pain",
        operationKey: randomUUID(),
        body: { text: "Left leg pain" },
        occurredAt,
        status: "unknown",
        sourceSpans: ["left leg pain"],
      },
    );
  }
  it("same-time records and unknown bucket paginate without gaps, duplicates or later inserts", async () => {
    for (let i = 0; i < 5; i++)
      await add({ precision: "exact", at: "2026-10-01T12:00:00.123456Z" });
    await add({ precision: "unknown" });
    await add({
      precision: "approximate",
      from: "2026-09-01T00:00:00Z",
      to: "2026-10-01T00:00:00Z",
      originalPhrase: "last month",
    });
    let page = await timeline(
      db.pool,
      patient.session,
      { kind: "patient" },
      { limit: 2 },
    );
    const all = [...page.items];
    await add({ precision: "exact", at: "2026-10-09T12:00:00Z" });
    while (page.nextCursor) {
      page = await timeline(
        db.pool,
        patient.session,
        { kind: "patient" },
        { limit: 2, cursor: page.nextCursor },
      );
      all.push(...page.items);
    }
    expect(all).toHaveLength(7);
    expect(new Set(all.map((e) => e.id)).size).toBe(7);
    expect(all.at(-1)?.occurred_at.precision).toBe("unknown");
    expect(all.some((e) => e.occurred_at.precision === "approximate")).toBe(
      true,
    );
    const source = await sourcePreview(
      db.pool,
      patient.session,
      { kind: "patient" },
      all[0].source_id,
    );
    expect(source.content).toContain("left leg pain");
    await expect(
      sourcePreview(
        db.pool,
        other.session,
        { kind: "patient" },
        all[0].source_id,
      ),
    ).rejects.toThrow("ACCESS_DENIED");
  });
});
