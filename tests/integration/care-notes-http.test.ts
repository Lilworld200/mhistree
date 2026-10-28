import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { POST, GET } from "@/app/api/practitioner/workspace/route";
import { careNoteFields } from "@/features/clinical-care/care-note-schema";
import {
  connectOrganization,
  assignPatient,
} from "@/features/organizations/assignments";
import {
  POST as organizationPOST,
  GET as organizationGET,
} from "@/app/api/organizations/workspace/route";
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
  connection: string;
beforeAll(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  db = await testDatabase();
  databaseMock.mockReturnValue(db.pool);
  doctor = await staffFixture(db.pool);
  patient = await staffFixture(db.pool);
  connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "allergy"],
      exclusions: [],
      evidence: "Synthetic identity and note authority checked in person.",
    })
  ).id;
});
afterAll(async () => {
  await db?.stop();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("saves and lists private notes through the real workspace transport, without AI", async () => {
  const response = await POST(
    new NextRequest("http://127.0.0.1:3101/api/practitioner/workspace", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
        cookie: `mhistree-session=${doctor.session}`,
      },
      body: JSON.stringify({
        connectionId: connection,
        action: "save-note",
        data: {
          requestKey: randomUUID(),
          patientPersonId: patient.personId,
          destination: "note",
          category: "clinical",
          fields: careNoteFields.parse({ content: "Private HTTP note" }),
          timezone: "Africa/Lagos",
        },
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).data.destination).toBe("note");
  const history = await GET(
    new NextRequest(
      `http://127.0.0.1:3101/api/practitioner/workspace?connection=${connection}&view=private-notes`,
      { headers: { cookie: `mhistree-session=${doctor.session}` } },
    ),
  );
  expect(history.status).toBe(200);
  expect((await history.json()).data.items[0].body.text).toBe(
    "Private HTTP note",
  );
  expect(gatewayMock).not.toHaveBeenCalled();
});
it("publishes a reviewed patient record and denies unauthorised transport access", async () => {
  const data = {
    requestKey: randomUUID(),
    patientPersonId: patient.personId,
    destination: "record",
    category: "allergy",
    fields: careNoteFields.parse({
      name: "Synthetic substance",
      certainty: "suspected",
    }),
    timezone: "Africa/Lagos",
    reviewed: true,
  };
  const response = await POST(
    new NextRequest("http://127.0.0.1:3101/api/practitioner/workspace", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
        cookie: `mhistree-session=${doctor.session}`,
      },
      body: JSON.stringify({
        connectionId: connection,
        action: "save-note",
        data,
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).data.eventId).toBeTruthy();
  const denied = await GET(
    new NextRequest(
      `http://127.0.0.1:3101/api/practitioner/workspace?connection=${connection}&view=private-notes`,
      { headers: { cookie: `mhistree-session=${patient.session}` } },
    ),
  );
  expect(denied.status).toBe(403);
});
it("keeps assigned organization notes separate and denies them after membership removal", async () => {
  const org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,records.write,consent.manage,assignments.manage}')",
    [org, doctor.accountId],
  );
  const c = (
    await connectOrganization(db.pool, doctor.session, {
      organizationId: org,
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories: ["clinical", "allergy"],
      exclusions: [],
      evidence: "Synthetic organization consent and identity confirmed.",
    })
  ).id;
  const assignment = await assignPatient(db.pool, doctor.session, {
    organizationId: org,
    connectionId: c,
    accountId: doctor.accountId,
    categories: ["clinical", "allergy"],
  });
  const context = {
    kind: "organization",
    organizationId: org,
    connectionId: c,
    assignmentId: assignment.id,
  };
  const d = {
    requestKey: randomUUID(),
    patientPersonId: patient.personId,
    destination: "note",
    category: "clinical",
    fields: careNoteFields.parse({ content: "Author-only organization note" }),
    timezone: "Africa/Lagos",
  };
  const response = await organizationPOST(
    new NextRequest("http://127.0.0.1:3101/api/organizations/workspace", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
        cookie: `mhistree-session=${doctor.session}`,
      },
      body: JSON.stringify({ context, action: "save-note", data: d }),
    }),
  );
  expect(response.status).toBe(200);
  const url = `http://127.0.0.1:3101/api/organizations/workspace?context=${encodeURIComponent(JSON.stringify(context))}&view=private-notes`;
  const list = await organizationGET(
    new NextRequest(url, {
      headers: { cookie: `mhistree-session=${doctor.session}` },
    }),
  );
  expect(list.status).toBe(200);
  expect(
    (await list.json()).data.items.map(
      (n: { body: { text: string } }) => n.body.text,
    ),
  ).toEqual(["Author-only organization note"]);
  await db.pool.query(
    "update mhistree.memberships set active=false where organization_id=$1 and account_id=$2",
    [org, doctor.accountId],
  );
  expect(
    (
      await organizationGET(
        new NextRequest(url, {
          headers: { cookie: `mhistree-session=${doctor.session}` },
        }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await GET(
        new NextRequest(
          `http://127.0.0.1:3101/api/practitioner/workspace?connection=${connection}&view=private-notes`,
          { headers: { cookie: `mhistree-session=${doctor.session}` } },
        ),
      )
    ).status,
  ).toBe(200);
});
