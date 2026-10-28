import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import {
  POST,
  GET as workspaceGET,
} from "@/app/api/practitioner/workspace/route";
import { GET as recordsGET } from "@/app/api/records/route";
import { GET as healthGET } from "@/app/api/health/route";
const { databaseMock, gatewayMock } = vi.hoisted(() => ({
  databaseMock: vi.fn(),
  gatewayMock: vi.fn(),
}));
vi.mock("@/lib/db/client", async (original) => ({
  ...(await original<typeof import("@/lib/db/client")>()),
  database: databaseMock,
}));
vi.mock("@/lib/ai/gateway", async (original) => ({
  ...(await original<typeof import("@/lib/ai/gateway")>()),
  aiGateway: gatewayMock,
}));
let db: Awaited<ReturnType<typeof testDatabase>>,
  doctor: Awaited<ReturnType<typeof staffFixture>>,
  patient: typeof doctor,
  connectionId: string;
const text = "The patient has a confirmed latex allergy.";
beforeAll(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  db = await testDatabase();
  databaseMock.mockReturnValue(db.pool);
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  connectionId = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["allergy"],
      exclusions: [],
      evidence: "Synthetic identity and explicit allergy consent confirmed.",
    })
  ).id;
  gatewayMock.mockReturnValue({
    generate: async () =>
      JSON.stringify({
        text: "Save to the timeline and allergies, or keep a private note?",
        evidenceIds: [],
        limitations: [],
        proposals: [
          {
            category: "allergy",
            body: { text },
            occurredAt: { precision: "unknown" },
            status: "active",
            sourceSpans: [text],
            missingDetails: [],
            medicationDetails: null,
          },
        ],
      }),
  });
});
afterAll(async () => {
  await db?.stop();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
function request(
  action: string,
  data: unknown,
  origin = "http://127.0.0.1:3101",
  session = doctor.session,
) {
  return new NextRequest("http://127.0.0.1:3101/api/practitioner/workspace", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: `mhistree-session=${session}`,
    },
    body: JSON.stringify({ connectionId, action, data }),
  });
}
it("transports the reviewed chat save to patient timeline and Health, with no fact saved by generation alone", async () => {
  const generated = await POST(
    request("ai", {
      question: text,
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
      timezone: "Africa/Lagos",
    }),
  );
  expect(generated.status).toBe(200);
  const run = (await generated.json()).data;
  expect(
    (
      await db.pool.query(
        "select id from mhistree.contributions where patient_person_id=$1",
        [patient.personId],
      )
    ).rows,
  ).toHaveLength(0);
  const data = {
    runId: run.id,
    itemId: run.proposals[0].id,
    destination: "record",
    reviewed: true,
    text,
  };
  expect(
    (await POST(request("ai-save", data, "https://foreign.example"))).status,
  ).toBe(403);
  expect(
    (await POST(request("ai-save", data, undefined, "invalid-session"))).status,
  ).toBe(401);
  expect(
    (await POST(request("ai-save", { ...data, category: "clinical" }))).status,
  ).toBe(422);
  expect(
    (await POST(request("ai-save", { ...data, reviewed: false }))).status,
  ).toBe(422);
  const saved = await POST(request("ai-save", data));
  expect(saved.status).toBe(200);
  expect(saved.headers.get("cache-control")).toBe("no-store");
  const eventId = (await saved.json()).data.eventId;
  expect((await POST(request("ai-save", data))).status).toBe(200);
  const headers = { cookie: `mhistree-session=${patient.session}` };
  const records = await recordsGET(
    new NextRequest("http://127.0.0.1:3101/api/records", { headers }),
  );
  const health = await healthGET(
    new NextRequest("http://127.0.0.1:3101/api/health", { headers }),
  );
  expect((await records.json()).data.items).toEqual([
    expect.objectContaining({
      id: eventId,
      category: "allergy",
      author_account_id: doctor.accountId,
      source_status: "professional-finalized",
    }),
  ]);
  expect((await health.json()).data.items).toEqual([
    expect.objectContaining({ id: eventId, category: "allergy" }),
  ]);
});

it("transports editable review preparation and normal-text confirmation through the workspace API", async () => {
  const generated = await POST(
    request("ai", {
      question: text,
      purpose: "question",
      includeOwnNotes: false,
      conversation: true,
      timezone: "Africa/Lagos",
    }),
  );
  const run = (await generated.json()).data;
  const { careNoteFields } =
    await import("@/features/clinical-care/care-note-schema");
  const prepared = await POST(
    request("ai-review", {
      runId: run.id,
      destination: "record",
      timezone: "Africa/Lagos",
      items: [
        {
          id: run.proposals[0].id,
          fields: careNoteFields.parse({
            name: "latex",
            certainty: "confirmed",
          }),
        },
      ],
    }),
  );
  expect(prepared.status).toBe(200);
  const review = (await prepared.json()).data;
  const payload = { reviewId: review.id, reviewed: true };
  expect(
    (
      await POST(
        request("ai-review-confirm", payload, "https://foreign.example"),
      )
    ).status,
  ).toBe(403);
  expect(
    (await POST(request("ai-review-confirm", { ...payload, reviewed: false })))
      .status,
  ).toBe(422);
  const confirmed = await POST(request("ai-review-confirm", payload));
  expect(confirmed.status).toBe(200);
  const message = (await confirmed.json()).data;
  expect(message.question).toContain("latex");
  expect(message.proposals).toEqual([]);
  const restored = await workspaceGET(
    new NextRequest(
      `http://127.0.0.1:3101/api/practitioner/workspace?connection=${connectionId}&view=ai-chat`,
      { headers: { cookie: `mhistree-session=${doctor.session}` } },
    ),
  );
  expect(restored.status).toBe(200);
  expect((await restored.json()).data.items.at(-1).id).toBe(message.id);
});
