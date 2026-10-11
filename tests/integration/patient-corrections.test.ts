import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { correctPatientReport } from "@/features/health-records/corrections";
import {
  healthState,
  medicationPresentation,
} from "@/features/health-records/current-state";
import { timeline, recordVersions } from "@/features/health-records/timeline";
describe("patient corrections through the atomic kernel", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("concurrent left/right correction has one winner, keeps source and updates current state", async () => {
    const source = await recordSource(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        patientPersonId: patient.personId,
        category: "ongoing",
        sourceTimezone: "UTC",
        content: "My left leg hurts",
        clientKey: randomUUID(),
      },
    );
    const event = await acceptContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        sourceId: source.sourceId,
        sourceVersion: 1,
        sourceItemId: "pain",
        operationKey: randomUUID(),
        body: { text: "Left leg pain", bodySite: "left leg" },
        occurredAt: { precision: "unknown" },
        status: "active",
        sourceSpans: ["left leg"],
      },
    );
    const correction = {
      eventId: event.eventId,
      version: 1,
      text: "Right leg pain",
      bodySite: "right leg",
      status: "active",
    };
    const result = await Promise.allSettled([
      correctPatientReport(db.pool, patient.session, {
        ...correction,
        requestKey: randomUUID(),
      }),
      correctPatientReport(db.pool, patient.session, {
        ...correction,
        requestKey: randomUUID(),
      }),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const state = await healthState(db.pool, patient.session);
    expect(state.items[0].body.bodySite).toBe("right leg");
    const page = await timeline(db.pool, patient.session, { kind: "patient" });
    expect(page.items[0].body.bodySite).toBe("right leg");
    const versions = await recordVersions(
      db.pool,
      patient.session,
      page.items[0].logical_id,
    );
    expect(versions).toHaveLength(2);
    expect(versions[1].body.bodySite).toBe("left leg");
    expect(
      (
        await db.pool.query(
          "select content from mhistree.sources where id=$1",
          [source.sourceId],
        )
      ).rows[0].content,
    ).toBe("My left leg hurts");
  });
  it("planned course end does not establish adherence or actual stopping", () => {
    expect(
      medicationPresentation(
        { medication: { useStatus: "taking", plannedEnd: "2025-01-01" } },
        new Date("2026-10-10"),
      ).useStatus,
    ).toBe("unknown");
    expect(
      medicationPresentation({
        medication: { useStatus: "stopped", plannedEnd: null },
      }).useStatus,
    ).toBe("stopped");
  });
});
