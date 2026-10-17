import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { createConversation, sendMessage } from "@/features/ai-chat/server";
import { POST } from "@/app/api/extraction/route";
import { GET as recordsGET } from "@/app/api/records/route";

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

let db: Awaited<ReturnType<typeof testDatabase>>;
let patient: Awaited<ReturnType<typeof staffFixture>>;
let other: Awaited<ReturnType<typeof staffFixture>>;
let messageId: string;
beforeAll(async () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  db = await testDatabase();
  databaseMock.mockReturnValue(db.pool);
  patient = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  const id = randomUUID();
  await createConversation(db.pool, patient.session, id);
  messageId = (
    await sendMessage(db.pool, patient.session, {
      conversationId: id,
      requestKey: randomUUID(),
      content: "I went jogging today.",
      timezone: "Africa/Lagos",
    })
  ).messageId;
});
afterAll(async () => {
  await db?.stop();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const request = (
  session: string,
  body: unknown,
  origin = "http://127.0.0.1:3101",
) =>
  new NextRequest("http://127.0.0.1:3101/api/extraction", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      cookie: `mhistree-session=${session}`,
    },
    body: JSON.stringify(body),
  });
it("processes the saved message directly without relying on a paginated job-status lookup", async () => {
  const generate = vi.fn().mockResolvedValue(
    JSON.stringify({
      items: [
        {
          category: "activity",
          text: "went jogging.",
          quote: "I went jogging today.",
          evidence: "self-report",
          timePhrase: "today",
          bodySite: null,
          medicationName: null,
          status: "unknown",
          ambiguity: null,
          linkQuote: null,
          page: null,
        },
      ],
      clarifications: [],
      patientMatch: "not-applicable",
    }),
  );
  gatewayMock.mockReturnValue({ generate });
  const response = await POST(request(patient.session, { messageId }));
  expect(response.status).toBe(200);
  expect((await response.json()).data.state).toBe("succeeded");
  expect(generate).toHaveBeenCalledTimes(1);
  expect(
    (await db.pool.query("select count(*) from mhistree.contributions")).rows[0]
      .count,
  ).toBe("1");
});
it("denies another patient's message, foreign origin and ambiguous request shape", async () => {
  gatewayMock.mockClear();
  expect((await POST(request(other.session, { messageId }))).status).toBe(403);
  expect(
    (
      await POST(
        request(patient.session, { messageId }, "https://foreign.example"),
      )
    ).status,
  ).toBe(403);
  expect(
    (await POST(request(patient.session, { messageId, id: randomUUID() })))
      .status,
  ).toBe(422);
  expect(gatewayMock).not.toHaveBeenCalled();
});

it("saves the exact meal/swollen-belly example as two dated source-linked records visible through the timeline HTTP route", async () => {
  const conversation = randomUUID();
  await createConversation(db.pool, patient.session, conversation);
  const text =
    "I ate a lot of food last night and my belly is swollen up this morning.";
  const sent = await sendMessage(db.pool, patient.session, {
    conversationId: conversation,
    requestKey: randomUUID(),
    content: text,
    timezone: "Africa/Lagos",
  });
  const activityQuote = "I ate a lot of food last night";
  const base = {
    evidence: "self-report",
    reportStyle: "reported-predicate",
    medicationName: null,
    status: "unknown",
    ambiguity: null,
    page: null,
    relation: null,
  };
  gatewayMock.mockReturnValue({
    generate: async () =>
      JSON.stringify({
        items: [
          {
            ...base,
            category: "activity",
            text: "ate a large amount of food the previous night.",
            quote: activityQuote,
            timePhrase: "last night",
            bodySite: null,
            linkQuote: null,
          },
          {
            ...base,
            category: "symptom",
            text: "noticed a swollen belly the following morning.",
            quote: "my belly is swollen up this morning",
            timePhrase: "this morning",
            bodySite: "belly",
            linkQuote: activityQuote,
          },
        ],
        clarifications: [],
        patientMatch: "not-applicable",
      }),
  });
  expect(
    (await POST(request(patient.session, { messageId: sent.messageId })))
      .status,
  ).toBe(200);
  const page = await recordsGET(
    new NextRequest("http://127.0.0.1:3101/api/records", {
      headers: { cookie: `mhistree-session=${patient.session}` },
    }),
  );
  const rows = (await page.json()).data.items;
  const symptom = rows.find((e: { body: { text: string } }) =>
    e.body.text.includes("swollen belly"),
  );
  const activity = rows.find((e: { body: { text: string } }) =>
    e.body.text.includes("large amount"),
  );
  expect(symptom && activity).toBeTruthy();
  expect(symptom.occurred_at.precision).toBe("approximate");
  expect(activity.occurred_at.precision).toBe("approximate");
  expect(Date.parse(symptom.occurred_at.from)).toBeGreaterThan(
    Date.parse(activity.occurred_at.from),
  );
  expect(symptom.body.contextLinks).toEqual([activity.id]);
  expect(symptom.source_status).toBe("patient-reported");
});
