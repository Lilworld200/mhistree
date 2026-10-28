import { afterAll, beforeAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/care/inbox/route";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
const runtime = vi.hoisted(() => ({
  database: vi.fn(),
  gateway: vi.fn(),
  after: [] as (() => Promise<void>)[],
}));
vi.mock("@/lib/db/client", async (original) => ({
  ...(await original<typeof import("@/lib/db/client")>()),
  database: runtime.database,
}));
vi.mock("@/lib/ai/gateway", async (original) => ({
  ...(await original<typeof import("@/lib/ai/gateway")>()),
  aiGateway: runtime.gateway,
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (work: () => Promise<void>) => runtime.after.push(work),
}));
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  patient: typeof doctor,
  connectionId: string;
beforeAll(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  db = await testDatabase();
  runtime.database.mockReturnValue(db.pool);
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.professionals set privileges=array_append(privileges,'messages.send') where account_id=$1",
    [doctor.accountId],
  );
  connectionId = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "symptom"],
      exclusions: [],
      evidence: "Synthetic identity and scope confirmed in person.",
    })
  ).id;
  runtime.gateway.mockReturnValue({
    generate: async () =>
      JSON.stringify({
        text: "No clinical finding in this logistical message.",
        evidenceIds: [],
        limitations: [],
        proposals: [],
      }),
  });
});
afterAll(async () => {
  await db?.stop();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function post(
  action: string,
  data: unknown,
  session = doctor.session,
  context: unknown = { kind: "direct", connectionId },
  origin = "http://127.0.0.1:3101",
) {
  return POST(
    new NextRequest("http://127.0.0.1:3101/api/care/inbox", {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie: `mhistree-session=${session}`,
      },
      body: JSON.stringify({ action, connectionId, context, data }),
    }),
  );
}
it("saves through guarded HTTP before processing and reads/acknowledges the standalone patient thread", async () => {
  const response = await post("send", {
    content: "Please come for a check-up.",
    requestKey: randomUUID(),
    timezone: "Africa/Lagos",
  });
  expect(response.status).toBe(200);
  expect(runtime.gateway).not.toHaveBeenCalled();
  expect(
    (
      await db.pool.query(
        "select state from mhistree.care_analysis_jobs where connection_id=$1",
        [connectionId],
      )
    ).rows[0].state,
  ).toBe("queued");
  await runtime.after.shift()!();
  expect(runtime.gateway).toHaveBeenCalledTimes(1);
  const thread = await GET(
    new NextRequest(
      `http://127.0.0.1:3101/api/care/inbox?connection=${connectionId}`,
      { headers: { cookie: `mhistree-session=${patient.session}` } },
    ),
  );
  expect(thread.status).toBe(200);
  const data = (await thread.json()).data;
  expect(data.items).toHaveLength(1);
  expect(data.items[0].author_role).toBe("practitioner");
  expect(
    (
      await post(
        "read",
        { throughSequence: data.items[0].sequence },
        patient.session,
        { kind: "patient" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await db.pool.query(
        "select count(*)::int n from mhistree.practitioner_ai_runs where account_id=$1",
        [doctor.accountId],
      )
    ).rows[0].n,
  ).toBe(0);
});
it("rejects foreign origins before storage and denies forged patient findings review", async () => {
  expect(
    (
      await post(
        "send",
        { content: "Should never store.", requestKey: randomUUID() },
        doctor.session,
        { kind: "direct", connectionId },
        "https://foreign.invalid",
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await post(
        "finding",
        { id: randomUUID(), version: 1, action: "review" },
        patient.session,
        { kind: "patient" },
      )
    ).status,
  ).toBe(403);
  expect(
    (await db.pool.query("select count(*)::int n from mhistree.care_messages"))
      .rows[0].n,
  ).toBe(1);
});
