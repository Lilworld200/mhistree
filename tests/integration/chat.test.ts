import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  conversationHistory,
  sendMessage,
  generateReply,
  cancelReply,
} from "@/features/ai-chat/server";
import { GeminiGateway, type AIGateway } from "@/lib/ai/gateway";
import { DomainError } from "@/lib/errors";
describe("durable patient chat", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    other: Awaited<ReturnType<typeof staffFixture>>,
    conversation: string,
    message: string;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
    conversation = randomUUID();
    await createConversation(db.pool, patient.session, conversation);
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("duplicate send saves one message; reload and cross-patient isolation use actual SQL policy", async () => {
    const input = {
      conversationId: conversation,
      requestKey: randomUUID(),
      content: "Synthetic test: What can this conversation help me organize?",
      timezone: "Africa/Lagos",
    };
    const result = await Promise.all([
      sendMessage(db.pool, patient.session, input),
      sendMessage(db.pool, patient.session, input),
    ]);
    expect(result[0]).toEqual(result[1]);
    message = result[0].messageId;
    expect(
      (await conversationHistory(db.pool, patient.session, conversation)).items,
    ).toHaveLength(1);
    await expect(
      conversationHistory(db.pool, other.session, conversation),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      sendMessage(db.pool, patient.session, {
        ...input,
        content: "Changed payload",
      }),
    ).rejects.toThrow("VERSION_CONFLICT");
  });
  it("generation outage retains exact message and permits retry", async () => {
    const outage: AIGateway = {
      generate: async () => {
        throw new DomainError("PROVIDER_UNAVAILABLE");
      },
    };
    await expect(
      generateReply(db.pool, patient.session, message, outage),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    const page = await conversationHistory(
      db.pool,
      patient.session,
      conversation,
    );
    expect(page.items[0].state).toBe("failed");
    expect(page.items[0].content).toContain("Synthetic test");
  });
  it("real configured gateway reply persists separately and never inserts clinical facts", async () => {
    const c = JSON.parse(await readFile(".local/ai-config.json", "utf8"));
    const gateway = new GeminiGateway({
      key: c.GEMINI_API_KEY,
      chatModel: c.AI_PATIENT_MODEL,
      extractionModel: c.AI_EXTRACTION_MODEL,
    });
    await generateReply(db.pool, patient.session, message, gateway);
    const page = await conversationHistory(
      db.pool,
      patient.session,
      conversation,
    );
    expect(page.items).toHaveLength(2);
    expect(page.items[1].role).toBe("assistant");
    expect(
      Number(
        (await db.pool.query("select count(*) from mhistree.contributions"))
          .rows[0].count,
      ),
    ).toBe(0);
  }, 60000);
  it("cancellation during generation withholds output", async () => {
    const sent = await sendMessage(db.pool, patient.session, {
      conversationId: conversation,
      requestKey: randomUUID(),
      content: "Synthetic cancellation test",
      timezone: "UTC",
    });
    const gateway: AIGateway = {
      generate: async () => {
        await cancelReply(db.pool, patient.session, sent.messageId);
        return "Must not be delivered";
      },
    };
    expect(
      (await generateReply(db.pool, patient.session, sent.messageId, gateway))
        .state,
    ).toBe("cancelled");
    expect(
      (
        await conversationHistory(db.pool, patient.session, conversation)
      ).items.some((m) => m.content === "Must not be delivered"),
    ).toBe(false);
  });
});
