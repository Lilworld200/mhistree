import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { createConversation, sendMessage } from "@/features/ai-chat/server";
import {
  enqueueMessageExtraction,
  processExtraction,
  validateExtraction,
} from "@/features/ai-chat/extraction/server";
import { resolveTime } from "@/features/ai-chat/extraction/time";
import { GeminiGateway } from "@/lib/ai/gateway";
describe("source-linked extraction", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("anchors day/month boundaries to original timezone and leaves unknown precision intact", () => {
    expect(
      resolveTime(
        "yesterday",
        new Date("2026-10-01T00:10:00Z"),
        "America/Los_Angeles",
      ),
    ).toEqual({
      precision: "range",
      from: "2026-09-29T07:00:00.000Z",
      to: "2026-09-30T07:00:00.000Z",
    });
    expect(
      resolveTime(
        "last month",
        new Date("2026-10-01T00:10:00Z"),
        "Africa/Lagos",
      ),
    ).toEqual({
      precision: "approximate",
      from: "2026-08-31T23:00:00.000Z",
      to: "2026-09-30T23:00:00.000Z",
      originalPhrase: "last month",
    });
    expect(resolveTime("a while ago", new Date(), "UTC").precision).toBe(
      "unknown",
    );
  });
  it("validation holds unknown medicine, other leg, malformed and non-patient statements", () => {
    const base = {
      category: "symptom",
      text: "pain",
      quote: "other leg",
      evidence: "self-report",
      timePhrase: "",
      bodySite: null,
      medicationName: null,
      status: "unknown",
      ambiguity: null,
      linkQuote: null,
      page: null,
    };
    const output = validateExtraction(
      {
        items: [
          base,
          { ...base, quote: "hypothetical pain", evidence: "hypothetical" },
          { ...base, category: "medication-use", quote: "unknown pill" },
          { invalid: true },
        ],
        clarifications: [],
        patientMatch: "not-applicable",
      },
      "other leg; hypothetical pain; unknown pill",
    );
    expect(output.items).toHaveLength(0);
    expect(output.issues).toHaveLength(3);
  });
  it.runIf(process.env.MHISTREE_LIVE_AI_TEST === "1")(
    "real model captures activity/pain without diagnosis; replay preserves source/event identities",
    async () => {
      const conversation = randomUUID();
      await createConversation(db.pool, patient.session, conversation);
      const message = await sendMessage(db.pool, patient.session, {
        conversationId: conversation,
        requestKey: randomUUID(),
        content:
          "I went running yesterday. My left leg hurt after running yesterday. This is my own report.",
        timezone: "Africa/Lagos",
      });
      const job = await enqueueMessageExtraction(
        db.pool,
        patient.session,
        message.messageId,
      );
      const c = { ...parseEnv(await readFile(".env", "utf8")), ...process.env };
      if (!c.GEMINI_API_KEY || !c.AI_PATIENT_MODEL || !c.AI_EXTRACTION_MODEL)
        throw new Error(
          "Live extraction requires configured Gemini model fields",
        );
      const gateway = new GeminiGateway({
        key: c.GEMINI_API_KEY,
        chatModel: c.AI_PATIENT_MODEL,
        extractionModel: c.AI_EXTRACTION_MODEL,
      });
      await processExtraction(db.pool, patient.session, job, gateway);
      const events = (
        await db.pool.query("select * from mhistree.contributions")
      ).rows;
      expect(events.some((e) => e.category === "activity")).toBe(true);
      expect(events.some((e) => e.category === "symptom")).toBe(true);
      expect(
        events.every(
          (e) =>
            e.body.reportStyle === "reported-predicate" &&
            e.body.text.trim().split(/\s+/).length >= 2,
        ),
      ).toBe(true);
      expect(
        events.every((e) => ["activity", "symptom"].includes(e.category)),
      ).toBe(true);
      await db.pool.query(
        "update mhistree.extraction_jobs set state='partial' where id=$1",
        [job],
      );
      await processExtraction(db.pool, patient.session, job, gateway);
      expect(
        Number(
          (await db.pool.query("select count(*) from mhistree.contributions"))
            .rows[0].count,
        ),
      ).toBe(events.length);
      const source = (
        await db.pool.query("select captured_at from mhistree.sources limit 1")
      ).rows[0];
      const original = (
        await db.pool.query(
          "select captured_at from mhistree.chat_messages where id=$1",
          [message.messageId],
        )
      ).rows[0];
      expect(source.captured_at).toEqual(original.captured_at);
    },
    60000,
  );
});
