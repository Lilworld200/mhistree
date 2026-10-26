import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { NextRequest } from "next/server";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import {
  directWorkspace,
  directTimeline,
} from "@/features/practitioner/workspace";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
import { workspaceAccess } from "@/features/auth/workspace-access";
import { saveWork } from "@/features/clinical-care/work";
import { finalizeEntry } from "@/features/clinical-care/entries";
import { revokeConnection } from "@/features/access/server";
import { GET } from "@/app/api/practitioner/workspace/route";
const { databaseMock } = vi.hoisted(() => ({ databaseMock: vi.fn() }));
vi.mock("@/lib/db/client", async (original) => ({
  ...(await original<typeof import("@/lib/db/client")>()),
  database: databaseMock,
}));
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  patient: typeof doctor,
  other: typeof doctor,
  connection: string,
  eventId: string;
beforeAll(async () => {
  db = await testDatabase();
  databaseMock.mockReturnValue(db.pool);
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "allergy"],
      exclusions: [],
      evidence: "Synthetic patient identity and explicit consent confirmed.",
    })
  ).id;
  const context = { kind: "direct" as const, connectionId: connection };
  for (const kind of ["draft", "private-note"] as const) {
    const work = await saveWork(db.pool, doctor.session, context, {
      requestKey: randomUUID(),
      patientPersonId: patient.personId,
      kind,
      category: "allergy",
      body: {
        text:
          kind === "draft"
            ? "Synthetic allergy finding"
            : "AUTHOR_PRIVATE_ONLY_MARKER",
      },
      occurredAt: { precision: "unknown" },
      timezone: "Africa/Lagos",
    });
    if (kind === "draft")
      eventId = (
        await finalizeEntry(db.pool, doctor.session, context, {
          id: work.id,
          version: 1,
          requestKey: randomUUID(),
          reviewed: true,
          status: "unknown",
        })
      ).eventId;
  }
});
afterAll(async () => {
  await db?.stop();
});
async function measure<T>(work: () => Promise<T>) {
  let checkouts = 0,
    statements = 0;
  const original = db.pool.connect.bind(db.pool);
  db.pool.connect = (async () => {
    checkouts++;
    const client = await original();
    const query = client.query,
      release = client.release;
    client.query = ((...args: unknown[]) => {
      statements++;
      return (query as unknown as (...values: unknown[]) => unknown).apply(
        client,
        args,
      );
    }) as PoolClient["query"];
    client.release = (...args) => {
      client.query = query;
      client.release = release;
      release.apply(client, args);
    };
    return client;
  }) as typeof db.pool.connect;
  try {
    return { value: await work(), checkouts, statements };
  } finally {
    db.pool.connect = original;
  }
}
it("the request-local auth snapshot, navigation and initial profile need at most three checkouts and half the previous 88 statements", async () => {
  const result = await measure(async () => {
    // currentPatient is React request-memoized: shell/page share this snapshot.
    await transaction((tx) => verifySession(tx, doctor.session), db.pool);
    await workspaceAccess(db.pool, doctor.session);
    return directWorkspace(db.pool, doctor.session, connection, "profile");
  });
  expect(result.checkouts).toBeLessThanOrEqual(3);
  expect(result.statements).toBeLessThanOrEqual(44);
  expect(result.value.state[0].id).toBe(eventId);
  expect(result.value.work).toHaveLength(0);
  expect(result.value.capabilities.work).toBe(true);
  expect(JSON.stringify(result.value)).not.toContain(
    "AUTHOR_PRIVATE_ONLY_MARKER",
  );
  console.info("Patient initial-read budget", {
    checkouts: result.checkouts,
    statements: result.statements,
  });
});
it("one combined profile/work refresh uses one transaction, retaining author-only work and scoped state", async () => {
  const result = await measure(() =>
    directWorkspace(db.pool, doctor.session, connection, "work"),
  );
  expect(result.checkouts).toBe(1);
  expect(result.statements).toBeLessThanOrEqual(25);
  expect(
    result.value.work.some((w) => w.body.text === "AUTHOR_PRIVATE_ONLY_MARKER"),
  ).toBe(true);
  expect(result.value.requests).toHaveLength(0);
  expect(result.value.messages).toBeNull();
  console.info("Patient active-panel refresh budget", {
    checkouts: result.checkouts,
    statements: result.statements,
  });
});
it("timeline no longer loads the overview/work and preserves finalized-only patient scope", async () => {
  const result = await measure(() =>
    directTimeline(db.pool, doctor.session, connection, {}),
  );
  expect(result.checkouts).toBe(1);
  expect(result.statements).toBeLessThanOrEqual(12);
  expect(result.value.items.map((row) => row.id)).toEqual([eventId]);
  expect(JSON.stringify(result.value)).not.toContain(
    "AUTHOR_PRIVATE_ONLY_MARKER",
  );
});
it("focused and legacy HTTP reads retain validation, private caching and actor/revocation denial", async () => {
  const request = (view: string, session = doctor.session) =>
    new NextRequest(
      `http://127.0.0.1:3101/api/practitioner/workspace?connection=${connection}&view=${view}`,
      { headers: { cookie: `mhistree-session=${session}` } },
    );
  for (const view of ["profile", "work", "requests", "messages", "all"]) {
    const response = await GET(request(view));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
  expect((await GET(request("invalid"))).status).toBe(422);
  expect((await GET(request("profile", other.session))).status).toBe(403);
  await revokeConnection(db.pool, patient.session, connection);
  for (const view of ["profile", "work", "timeline", "all"])
    expect((await GET(request(view))).status).toBe(403);
});
