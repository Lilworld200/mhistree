import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { createConversation, sendMessage } from "@/features/ai-chat/server";
import {
  enqueueMessageExtraction,
  processExtraction,
  validateExtraction,
} from "@/features/ai-chat/extraction/server";
import { retrieveEvidence } from "@/features/ai-chat/retrieval";
import {
  timeline,
  recordVersions,
  sourcePreview,
} from "@/features/health-records/timeline";
import { recordNarrative } from "@/features/health-records/narrative";
import { GeminiGateway, type AIGateway } from "@/lib/ai/gateway";

const item = (quote: string, text: string, extra: object = {}) => ({
  category: "activity",
  text,
  quote,
  reportStyle: "reported-predicate",
  relation: null,
  evidence: "self-report",
  timePhrase: "",
  bodySite: null,
  medicationName: null,
  status: "unknown",
  ambiguity: null,
  linkQuote: null,
  page: null,
  ...extra,
});
const envelope = (items: object[]) =>
  JSON.stringify({ items, clarifications: [], patientMatch: "not-applicable" });
const gateway = (items: object[]): AIGateway => ({
  generate: async () => envelope(items),
});

describe("contextual patient journal extraction", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let patient: Awaited<ReturnType<typeof staffFixture>>;
  let other: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  async function conversation() {
    const id = randomUUID();
    await createConversation(db.pool, patient.session, id);
    return id;
  }
  async function send(id: string, content: string) {
    const sent = await sendMessage(db.pool, patient.session, {
      conversationId: id,
      requestKey: randomUUID(),
      content,
      timezone: "Africa/Lagos",
    });
    return {
      ...sent,
      job: await enqueueMessageExtraction(
        db.pool,
        patient.session,
        sent.messageId,
      ),
    };
  }
  const heads = async (id: string) =>
    (
      await db.pool.query(
        `select e.*,s.captured_at from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id
     join mhistree.sources s on s.id=e.source_id join mhistree.chat_messages m on m.id=s.chat_message_id
     where m.conversation_id=$1 order by e.category,e.version`,
        [id],
      )
    ).rows;

  it("retains contextual descriptions, enriches one occurrence, links a new symptom, and preserves all sources", async () => {
    const id = await conversation();
    const firstText = "Jogging on 2026-10-17 was stressful.";
    const first = await send(id, firstText);
    expect(
      await processExtraction(
        db.pool,
        patient.session,
        first.job,
        gateway([
          item(firstText, "went jogging and found the run stressful.", {
            timePhrase: "2026-10-17",
          }),
        ]),
      ),
    ).toEqual({ state: "succeeded" });
    const activity = (await heads(id))[0];
    expect(recordNarrative(activity, "patient")).toBe(
      "You reported that you went jogging and found the run stressful.",
    );
    expect(recordNarrative(activity)).toBe(
      "The patient reported that they went jogging and found the run stressful.",
    );

    const detailText = "That same run lasted 40 minutes.";
    const detail = await send(id, detailText);
    const contextualGateway: AIGateway = {
      generate: async (_policy, messages) => {
        const context = JSON.parse(messages[0].content).context;
        expect(
          context.previousPatientMessages.map(
            (m: { content: string }) => m.content,
          ),
        ).toEqual([firstText]);
        expect(context.previousReports[0].eventId).toBe(activity.id);
        expect(JSON.stringify(context)).not.toContain(other.personId);
        return envelope([
          item(
            detailText,
            "went jogging for 40 minutes and found the run stressful.",
            {
              relation: {
                eventId: activity.id,
                kind: "same-report",
                referenceQuote: "That same run",
              },
            },
          ),
        ]);
      },
    };
    expect(
      (
        await processExtraction(
          db.pool,
          patient.session,
          detail.job,
          contextualGateway,
        )
      ).state,
    ).toBe("succeeded");
    const enriched = (await heads(id))[0];
    expect(enriched.logical_id).toBe(activity.logical_id);
    expect(enriched.version).toBe(2);
    expect(enriched.occurred_at).toEqual(activity.occurred_at);
    const versions = await recordVersions(
      db.pool,
      patient.session,
      activity.logical_id,
    );
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(
      (
        await sourcePreview(
          db.pool,
          patient.session,
          { kind: "patient" },
          activity.source_id,
        )
      ).content,
    ).toBe(firstText);

    const painText = "I sprained my left ankle while jogging on that same run.";
    const pain = await send(id, painText);
    expect(
      (
        await processExtraction(
          db.pool,
          patient.session,
          pain.job,
          gateway([
            item(
              painText,
              "sprained the left ankle while jogging on the same run.",
              {
                category: "symptom",
                bodySite: "left ankle",
                relation: {
                  eventId: enriched.id,
                  kind: "same-incident",
                  referenceQuote: "that same run",
                },
              },
            ),
          ]),
        )
      ).state,
    ).toBe("succeeded");
    const rows = await heads(id);
    expect(rows).toHaveLength(2);
    const symptom = rows.find((r) => r.category === "symptom")!;
    expect(symptom.body.contextLinks).toEqual([enriched.id]);
    expect(symptom.occurred_at).toEqual(activity.occurred_at);
    expect(symptom.source_status).toBe("patient-reported");
    const evidence = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "jogging ankle",
    );
    expect(
      evidence.evidence.find((r) => r.id === enriched.id)?.priorSources,
    ).toEqual([
      { sourceId: activity.source_id, version: 1, spans: [firstText] },
    ]);
    expect(JSON.stringify(evidence.evidence).length).toBeLessThanOrEqual(24000);
    expect(evidence.evidence.find((r) => r.id === symptom.id)?.text).toContain(
      "The patient reported that they sprained the left ankle while jogging",
    );
    expect(
      (
        await timeline(db.pool, patient.session, { kind: "patient" })
      ).items.filter((r) => rows.some((e) => e.id === r.id)),
    ).toHaveLength(2);
    await db.pool.query(
      "update mhistree.extraction_jobs set state='partial' where id=$1",
      [detail.job],
    );
    expect(
      (
        await processExtraction(
          db.pool,
          patient.session,
          detail.job,
          contextualGateway,
        )
      ).state,
    ).toBe("succeeded");
    expect(await heads(id)).toHaveLength(2);
  });

  it("keeps a later run separate and refuses a conflicting-date merge without partial record writes", async () => {
    const id = await conversation();
    const first = await send(id, "I went jogging on 2026-10-17.");
    await processExtraction(
      db.pool,
      patient.session,
      first.job,
      gateway([
        item("I went jogging on 2026-10-17.", "went jogging.", {
          timePhrase: "2026-10-17",
        }),
      ]),
    );
    const prior = (await heads(id))[0];
    const second = await send(id, "I went jogging again on 2026-10-18.");
    const result = await processExtraction(
      db.pool,
      patient.session,
      second.job,
      gateway([
        item(
          "I went jogging again on 2026-10-18.",
          "went jogging again on a separate run.",
          {
            timePhrase: "2026-10-18",
            relation: {
              eventId: prior.id,
              kind: "same-report",
              referenceQuote: "jogging again",
            },
          },
        ),
      ]),
    );
    expect(result.state).toBe("partial");
    expect(await heads(id)).toHaveLength(1);
    expect(
      (
        await db.pool.query(
          "select count(*) from mhistree.sources where chat_message_id=$1",
          [second.messageId],
        )
      ).rows[0].count,
    ).toBe("0");
    // A fresh, independently identified next-day report is not deduplicated by keyword.
    const third = await send(id, "On 2026-10-18 I went jogging again.");
    await processExtraction(
      db.pool,
      patient.session,
      third.job,
      gateway([
        item(
          "On 2026-10-18 I went jogging again.",
          "went jogging again on a separate run.",
          { timePhrase: "2026-10-18" },
        ),
      ]),
    );
    expect(await heads(id)).toHaveLength(2);
  });

  it("rejects unsupported links, labels and another patient's job before any evidence leaks", async () => {
    const id = await conversation();
    const sent = await send(id, "I went jogging.");
    const hostile: AIGateway = {
      generate: async () => {
        throw new Error("must not reach model");
      },
    };
    expect(
      await processExtraction(db.pool, other.session, sent.job, hostile),
    ).toEqual({ state: "unchanged" });
    const result = await processExtraction(
      db.pool,
      patient.session,
      sent.job,
      gateway([
        item("I went jogging.", "went jogging.", {
          relation: {
            eventId: randomUUID(),
            kind: "same-report",
            referenceQuote: "went jogging",
          },
        }),
        item("I went jogging.", "jogging"),
      ]),
    );
    expect(result.state).toBe("partial");
    expect(await heads(id)).toHaveLength(0);
    expect(
      recordNarrative(
        {
          body: { text: "jogging" },
          source_status: "patient-reported",
          source_spans: ["I went jogging."],
        },
        "patient",
      ),
    ).toBe("You reported: “I went jogging.”");
  });

  it("links a symptom to an exactly timed run without inventing the symptom's exact time", async () => {
    const id = await conversation();
    const firstText = "I went jogging at 2026-10-17T09:00:00+01:00.";
    const first = await send(id, firstText);
    await processExtraction(
      db.pool,
      patient.session,
      first.job,
      gateway([
        item(firstText, "went jogging.", {
          timePhrase: "2026-10-17T09:00:00+01:00",
        }),
      ]),
    );
    const prior = (await heads(id))[0];
    expect(prior.occurred_at.precision).toBe("exact");
    const nextText = "My ankle hurt during that same run.";
    const next = await send(id, nextText);
    await processExtraction(
      db.pool,
      patient.session,
      next.job,
      gateway([
        item(nextText, "had ankle pain during the same run.", {
          category: "symptom",
          bodySite: "ankle",
          timePhrase: "during that same run",
          relation: {
            eventId: prior.id,
            kind: "same-incident",
            referenceQuote: "that same run",
          },
        }),
      ]),
    );
    const symptom = (await heads(id)).find((e) => e.category === "symptom")!;
    expect(symptom.occurred_at.precision).toBe("unknown");
    expect(symptom.body.contextLinks).toEqual([prior.id]);
  });

  it("rechecks earlier context under a conversation lock so concurrent follow-ups cannot duplicate a run", async () => {
    const id = await conversation();
    const first = await send(id, "I went jogging today.");
    const second = await send(id, "That same run was stressful.");
    let preparedSecond!: () => void;
    const secondReady = new Promise<void>((r) => {
      preparedSecond = r;
    });
    let releaseSecond!: () => void;
    const firstDone = new Promise<void>((r) => {
      releaseSecond = r;
    });
    const p1 = processExtraction(db.pool, patient.session, first.job, {
      generate: async () => {
        await secondReady;
        return envelope([
          item("I went jogging today.", "went jogging.", {
            timePhrase: "today",
          }),
        ]);
      },
    });
    const p2 = processExtraction(db.pool, patient.session, second.job, {
      generate: async () => {
        preparedSecond();
        await firstDone;
        return envelope([
          item(
            "That same run was stressful.",
            "went jogging and found the run stressful.",
          ),
        ]);
      },
    });
    await p1;
    releaseSecond();
    expect((await p2).state).toBe("partial");
    expect(await heads(id)).toHaveLength(1);
    expect(
      (
        await db.pool.query(
          "select output from mhistree.extraction_jobs where id=$1",
          [second.job],
        )
      ).rows[0].output,
    ).toBeNull();
    const prior = (await heads(id))[0];
    await processExtraction(
      db.pool,
      patient.session,
      second.job,
      gateway([
        item(
          "That same run was stressful.",
          "went jogging and found the run stressful.",
          {
            relation: {
              eventId: prior.id,
              kind: "same-report",
              referenceQuote: "That same run",
            },
          },
        ),
      ]),
    );
    expect(await heads(id)).toHaveLength(1);
    expect((await heads(id))[0].version).toBe(2);
  });

  it("does not extract questions or third-party stories into the journal", () => {
    const result = validateExtraction(
      {
        items: [
          item("Could jogging hurt?", "had pain after jogging.", {
            evidence: "question",
          }),
          item("My friend went jogging.", "went jogging.", {
            evidence: "third-party",
          }),
        ],
        clarifications: [],
        patientMatch: "not-applicable",
      },
      "Could jogging hurt? My friend went jogging.",
    );
    expect(result.items).toHaveLength(0);
  });

  it("normalizes only the known display prefix, preserving the contextual report", () => {
    const result = validateExtraction(
      {
        items: [
          item(
            "That same run lasted 40 minutes.",
            "The patient reported that they went jogging for 40 minutes and found the run stressful.",
          ),
        ],
        clarifications: [],
        patientMatch: "not-applicable",
      },
      "That same run lasted 40 minutes.",
    );
    expect(result.items[0].item.text).toBe(
      "went jogging for 40 minutes and found the run stressful.",
    );
  });

  it.runIf(process.env.MHISTREE_LIVE_AI_TEST === "1")(
    "real model connects a follow-up to the original run without repeating the activity",
    async () => {
      const env = {
        ...parseEnv(await readFile(".env", "utf8")),
        ...process.env,
      };
      if (
        !env.GEMINI_API_KEY ||
        !env.AI_PATIENT_MODEL ||
        !env.AI_EXTRACTION_MODEL
      )
        throw new Error(
          "Live journal evaluation requires configured Gemini model fields",
        );
      const model = new GeminiGateway({
        key: env.GEMINI_API_KEY,
        chatModel: env.AI_PATIENT_MODEL,
        extractionModel: env.AI_EXTRACTION_MODEL,
      });
      const samples: { source: string; output: unknown }[] = [];
      const live: AIGateway = {
        generate: async (policy, messages, options) => {
          const raw = await model.generate(policy, messages, options);
          samples.push({
            source: JSON.parse(messages[0].content).source,
            output: JSON.parse(raw),
          });
          return raw;
        },
      };
      const id = await conversation();
      try {
        for (const text of [
          "Jogging today was stressful.",
          "I sprained my left ankle while jogging on that same run.",
          "That same run lasted 40 minutes.",
        ]) {
          const sent = await send(id, text);
          expect(
            (await processExtraction(db.pool, patient.session, sent.job, live))
              .state,
          ).toBe("succeeded");
        }
        const rows = await heads(id);
        expect(rows.filter((e) => e.category === "activity")).toHaveLength(1);
        expect(rows.filter((e) => e.category === "symptom")).toHaveLength(1);
        const activity = rows.find((e) => e.category === "activity")!;
        const symptom = rows.find((e) => e.category === "symptom")!;
        expect(activity.version).toBe(2);
        expect(activity.body.text).toMatch(/40/);
        expect(activity.body.text).toMatch(/stress|tough|difficult|strenuous/i);
        expect(symptom.body.text).toMatch(/ankle/i);
        expect(symptom.body.text).toMatch(/jogg|run/i);
        expect(symptom.body.contextLinks).toHaveLength(1);
      } finally {
        await mkdir(".local", { recursive: true });
        await writeFile(
          ".local/journal-live-review.json",
          JSON.stringify(samples, null, 2),
        );
      }
    },
    180000,
  );
});
