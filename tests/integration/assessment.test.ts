import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  conversationHistory,
} from "@/features/ai-chat/server";
import { requestAssessment } from "@/features/ai-chat/assessment";
import { retrieveEvidence } from "@/features/ai-chat/retrieval";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { GeminiGateway } from "@/lib/ai/gateway";
describe("grounded patient assessment", () => {
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
  it("real model cites actual authorized evidence, recognizes old unknown status and writes no diagnosis", async () => {
    const source = await recordSource(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        patientPersonId: patient.personId,
        category: "symptom",
        sourceTimezone: "UTC",
        content:
          "I had mild left leg pain after running in January 2024. I have not reported whether it is present now.",
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
        sourceItemId: "old-pain",
        operationKey: randomUUID(),
        body: { text: "Left leg pain after running; current status unknown" },
        occurredAt: {
          precision: "approximate",
          from: "2024-01-01T00:00:00Z",
          to: "2024-02-01T00:00:00Z",
          originalPhrase: "January 2024",
        },
        status: "unknown",
        sourceSpans: ["mild left leg pain"],
      },
    );
    expect(
      (
        await retrieveEvidence(
          db.pool,
          other.session,
          { kind: "patient" },
          patient.personId,
          "leg",
        )
      ).evidence,
    ).toHaveLength(0);
    const id = randomUUID();
    await createConversation(db.pool, patient.session, id);
    const c = JSON.parse(await readFile(".local/ai-config.json", "utf8"));
    const gateway = new GeminiGateway({
      key: c.GEMINI_API_KEY,
      chatModel: c.AI_PATIENT_MODEL,
      extractionModel: c.AI_EXTRACTION_MODEL,
    });
    await requestAssessment(
      db.pool,
      patient.session,
      { conversationId: id, requestKey: randomUUID(), timezone: "UTC" },
      gateway,
    );
    const reply = (
      await conversationHistory(db.pool, patient.session, id)
    ).items.find((m) => m.role === "assistant");
    expect(reply?.content).toContain("AI assessment");
    expect(reply?.content).toContain(event.eventId);
    expect(reply?.content).toMatch(/unknown|current|outdated|old|2024/i);
    expect(
      Number(
        (await db.pool.query("select count(*) from mhistree.contributions"))
          .rows[0].count,
      ),
    ).toBe(1);
  }, 60000);
  it("unsupported citations are rejected instead of fabricated", async () => {
    const id = randomUUID();
    await createConversation(db.pool, patient.session, id);
    await expect(
      requestAssessment(
        db.pool,
        patient.session,
        { conversationId: id, requestKey: randomUUID(), timezone: "UTC" },
        {
          generate: async () =>
            JSON.stringify({
              summary: "Test",
              possibilities: [
                {
                  explanation: "Test",
                  support: "limited",
                  evidenceIds: [randomUUID()],
                },
              ],
              gaps: [],
              urgency: "Unknown",
            }),
        },
      ),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(
      (await conversationHistory(db.pool, patient.session, id)).items.every(
        (m) => m.role === "patient",
      ),
    ).toBe(true);
  });
});
