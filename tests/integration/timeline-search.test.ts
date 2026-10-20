import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { searchTimeline } from "@/features/ai-chat/timeline-search";
import { retrieveEvidence } from "@/features/ai-chat/retrieval";
import {
  extractionContext,
  modelExtractionContext,
} from "@/features/ai-chat/extraction/context";
import { withAccess } from "@/features/access/server";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
} from "@/features/ai-chat/server";
import {
  enqueueMessageExtraction,
  processExtraction,
} from "@/features/ai-chat/extraction/server";
import { GeminiGateway, type AIGateway } from "@/lib/ai/gateway";

describe("timeline search throughout chat", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let patient: Awaited<ReturnType<typeof staffFixture>>, other: typeof patient;
  let stomach: string, run: string;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
    stomach = await add(
      "had stomach ache on Monday",
      "symptom",
      "2026-10-12T10:00:00Z",
    );
    run = await add(
      "went jogging on Saturday",
      "activity",
      "2026-10-17T08:00:00Z",
    );
    // More than the old40-row cap: persistent states must not bury a topic match.
    for (let i = 0; i < 41; i++)
      await add(
        `reported unrelated baseline detail ${i}`,
        "baseline",
        "2026-10-19T10:00:00Z",
      );
    await add(
      "had stomach ache belonging to another patient",
      "symptom",
      "2026-10-19T10:00:00Z",
      other,
    );
  });
  afterAll(async () => {
    await db?.stop();
  });
  async function add(
    text: string,
    category: "symptom" | "activity" | "baseline",
    at: string,
    actor = patient,
  ) {
    const source = await recordSource(
      db.pool,
      actor.session,
      { kind: "patient" },
      {
        patientPersonId: actor.personId,
        category,
        sourceTimezone: "Africa/Lagos",
        content: text,
        clientKey: randomUUID(),
      },
    );
    const result = await acceptContribution(
      db.pool,
      actor.session,
      { kind: "patient" },
      {
        sourceId: source.sourceId,
        sourceVersion: 1,
        sourceItemId: "report",
        operationKey: randomUUID(),
        body: { text, reportStyle: "reported-predicate" },
        occurredAt: { precision: "exact", at },
        status: "unknown",
        sourceSpans: [text],
      },
    );
    return result.eventId;
  }
  async function send(content: string) {
    const id = randomUUID();
    await createConversation(db.pool, patient.session, id);
    return {
      id,
      ...(await sendMessage(db.pool, patient.session, {
        conversationId: id,
        requestKey: randomUUID(),
        content,
        timezone: "Africa/Lagos",
      })),
    };
  }
  it("finds belly/stomach synonyms despite filler and41 newer persistent records", async () => {
    const result = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "Well I just wanted to tell you that I have been thinking about it and my belly is getting better",
    );
    expect(result.evidence[0].id).toBe(stomach);
    expect(result.evidence[0].relevance).toBe("topic-match");
    expect(result.evidence[0].eventTime).toEqual({
      precision: "exact",
      at: "2026-10-12T10:00:00Z",
    });
    expect(
      result.evidence.some((e) => e.text.includes("another patient")),
    ).toBe(false);
    expect(JSON.stringify(result.evidence).length).toBeLessThanOrEqual(24000);
    expect(result.evidence.length).toBeLessThanOrEqual(32);
  });
  it("retrieves a run as possible leg-pain context without writing a link or changing history", async () => {
    const result = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "My legs are paining me",
    );
    expect(result.evidence.find((e) => e.id === run)?.relevance).toBe(
      "possible-context",
    );
    const rows = await searchTimeline(
      db.pool,
      other.session,
      { kind: "patient" },
      patient.personId,
      "stomach",
    );
    expect(rows).toHaveLength(0);
    expect(
      (
        await db.pool.query(
          "select body->'contextLinks' links from mhistree.contributions where id=$1",
          [run],
        )
      ).rows[0].links,
    ).toEqual([]);
  });
  it("always searches before reply and passes dated uncertainty instructions into the real generation owner", async () => {
    const sent = await send("My belly is getting better");
    const gateway: AIGateway = {
      generate: async (system) => {
        expect(system).toContain(stomach);
        expect(system).toContain("2026-10-12");
        expect(system).toContain("before treating it as the same episode");
        expect(system).toContain("topic-match");
        expect(system).toContain(
          "identifiers/source lineage are internal only",
        );
        expect(system).not.toContain("cite event IDs if used");
        return "Glad it's easing. Do you mean the stomach ache you mentioned on 12 October?";
      },
    };
    expect(
      (await generateReply(db.pool, patient.session, sent.messageId, gateway))
        .state,
    ).toBe("succeeded");
    expect(
      (await conversationHistory(db.pool, patient.session, sent.id)).items.at(
        -1,
      )?.content,
    ).not.toContain(stomach);
  });
  it("does not promote an old activity as a recent possible cause", async () => {
    const oldRun = await add(
      "went jogging long ago",
      "activity",
      "2024-01-01T08:00:00Z",
    );
    const evidence = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "My legs hurt",
    );
    expect(evidence.evidence.find((e) => e.id === run)?.relevance).toBe(
      "possible-context",
    );
    expect(evidence.evidence.find((e) => e.id === oldRun)?.relevance).not.toBe(
      "possible-context",
    );
  });
  it("gives extraction wider timeline context but rejects a speculative merge and preserves the original", async () => {
    const sent = await send("My belly is getting better");
    const context = await withAccess(
      db.pool,
      patient.session,
      { kind: "patient" },
      (a) => extractionContext(a, sent.messageId),
    );
    expect(
      modelExtractionContext(context)?.possibleTimelineContext.some(
        (e) => e.eventId === stomach,
      ),
    ).toBe(true);
    expect(context.reports).toHaveLength(0); // Different conversation, no eligible merge target.
    const job = await enqueueMessageExtraction(
      db.pool,
      patient.session,
      sent.messageId,
    );
    const gateway: AIGateway = {
      generate: async (system, messages) => {
        expect(system).toContain("never proof of a shared occurrence");
        expect(messages[0].content).toContain(stomach);
        return JSON.stringify({
          patientMatch: "not-applicable",
          clarifications: [],
          items: [
            {
              category: "symptom",
              text: "reported that belly discomfort was easing",
              reportStyle: "reported-predicate",
              quote: "My belly is getting better",
              evidence: "self-report",
              timePhrase: "",
              bodySite: "belly",
              medicationName: null,
              status: "unknown",
              ambiguity: null,
              linkQuote: null,
              page: null,
              relation: {
                eventId: stomach,
                kind: "same-report",
                referenceQuote: "My belly is getting better",
              },
            },
          ],
        });
      },
    };
    const result = await processExtraction(
      db.pool,
      patient.session,
      job,
      gateway,
    );
    expect(result.state).toBe("partial");
    expect(
      (
        await db.pool.query(
          "select version,status from mhistree.contributions where id=$1",
          [stomach],
        )
      ).rows[0],
    ).toEqual({ version: 1, status: "unknown" });
  });
  it("saves a clear improvement observation without resolving or linking the possible earlier episode", async () => {
    const sent = await send("My belly is getting better");
    const job = await enqueueMessageExtraction(
      db.pool,
      patient.session,
      sent.messageId,
    );
    const result = await processExtraction(db.pool, patient.session, job, {
      generate: async () =>
        JSON.stringify({
          patientMatch: "not-applicable",
          clarifications: ["Is this the stomach issue reported on 12 October?"],
          items: [
            {
              category: "symptom",
              text: "noticed that belly discomfort was easing",
              reportStyle: "reported-predicate",
              quote: "My belly is getting better",
              evidence: "self-report",
              timePhrase: "",
              bodySite: "belly",
              medicationName: null,
              status: "unknown",
              ambiguity: null,
              linkQuote: null,
              page: null,
              relation: null,
            },
          ],
        }),
    });
    expect(result.state).toBe("partial");
    const row = (
      await db.pool.query(
        "select e.* from mhistree.contributions e join mhistree.sources s on s.id=e.source_id where s.chat_message_id=$1",
        [sent.messageId],
      )
    ).rows[0];
    expect(row.body.contextLinks).toEqual([]);
    expect(row.status).toBe("unknown");
    expect(row.version).toBe(1);
    expect(row.logical_id).not.toBe(
      (
        await db.pool.query(
          "select logical_id from mhistree.contributions where id=$1",
          [stomach],
        )
      ).rows[0].logical_id,
    );
  });
  it("uses only the latest correction while keeping earlier source lineage", async () => {
    const source = await recordSource(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        patientPersonId: patient.personId,
        category: "symptom",
        sourceTimezone: "UTC",
        content: "Correction: stomach ache was mild",
        clientKey: randomUUID(),
      },
    );
    const old = (
      await db.pool.query(
        "select logical_id from mhistree.contributions where id=$1",
        [stomach],
      )
    ).rows[0];
    const correction = await acceptContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        sourceId: source.sourceId,
        sourceVersion: 1,
        sourceItemId: "correct",
        operationKey: randomUUID(),
        body: {
          text: "had mild stomach ache on Monday",
          reportStyle: "reported-predicate",
        },
        occurredAt: { precision: "exact", at: "2026-10-12T10:00:00Z" },
        status: "unknown",
        sourceSpans: ["stomach ache was mild"],
        correction: { logicalId: old.logical_id, expectedVersion: 1 },
      },
    );
    const evidence = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "belly",
    );
    expect(evidence.evidence.some((e) => e.id === stomach)).toBe(false);
    expect(
      evidence.evidence.find((e) => e.id === correction.eventId)?.priorSources,
    ).toHaveLength(1);
    stomach = correction.eventId;
  });
  it.runIf(process.env.MHISTREE_LIVE_AI_TEST === "1")(
    "real Gemini uses earlier dated history to ask about possible links across conversations",
    async () => {
      const env = {
        ...parseEnv(await readFile(".env", "utf8")),
        ...process.env,
      };
      const gateway = new GeminiGateway({
        key: env.GEMINI_API_KEY!,
        chatModel: env.AI_PATIENT_MODEL!,
        extractionModel: env.AI_EXTRACTION_MODEL!,
      });
      const recalled = await add(
        "had serious stomach pain on October 17",
        "symptom",
        "2026-10-17T10:00:00Z",
      );
      for (const [text, topic, id] of [
        [
          "Do you remember what I told you about my belly pain?",
          /17|seventeen/i,
          recalled,
        ],
        ["My belly is getting better", /stomach|belly|abdom/i, stomach],
        [
          "My legs are paining me",
          /jog|run|Saturday|17 October|October 17/i,
          run,
        ],
      ] as const) {
        const sent = await send(text);
        await generateReply(db.pool, patient.session, sent.messageId, gateway);
        const reply = (
          await conversationHistory(db.pool, patient.session, sent.id)
        ).items.at(-1)!.content;
        expect(reply).toMatch(topic);
        expect(reply).toContain("?");
        expect(reply).not.toContain(id);
        expect(reply).not.toMatch(
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
        );
        expect(reply).not.toMatch(
          /\b(?:note|entry|database|timeline|record ID)\b/i,
        );
        expect(reply).not.toMatch(
          /(?:jogging|running) (?:caused|is why)|you have recovered/i,
        );
      }
    },
    120000,
  );
});
