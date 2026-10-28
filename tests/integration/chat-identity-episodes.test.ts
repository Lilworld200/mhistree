import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
} from "@/features/ai-chat/server";
import {
  enqueueMessageExtraction,
  processExtraction,
  validateExtraction,
} from "@/features/ai-chat/extraction/server";
import { retrieveEvidence } from "@/features/ai-chat/retrieval";
import { withAccess } from "@/features/access/server";
import { extractionContext } from "@/features/ai-chat/extraction/context";
import type { AIGateway } from "@/lib/ai/gateway";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { GroqGateway } from "@/lib/ai/groq";
import { CompatibleGateway } from "@/lib/ai/compatible";

const observation = (quote: string, extra: object = {}) => ({
  category: "symptom",
  text: quote,
  quote,
  evidence: "self-report",
  timePhrase: "",
  bodySite: "belly",
  medicationName: null,
  status: "active",
  ambiguity: null,
  linkQuote: null,
  page: null,
  relation: null,
  ...extra,
});
const output = (items: object[]) =>
  JSON.stringify({ items, clarifications: [] });
const adapter = (items: object[]): AIGateway => ({
  generate: async () => output(items),
});

describe("verified identity, bounded recall and retained episode observations", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    other: typeof patient;
  beforeAll(async () => {
    db = await testDatabase();
    other = await staffFixture(db.pool);
  });
  beforeEach(async () => {
    patient = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  async function chat() {
    const id = randomUUID();
    await createConversation(db.pool, patient.session, id);
    return id;
  }
  async function say(id: string, content: string, at?: string) {
    const sent = await sendMessage(db.pool, patient.session, {
      conversationId: id,
      content,
      requestKey: randomUUID(),
      timezone: "Africa/Lagos",
    });
    if (at)
      await db.pool.query(
        "update mhistree.chat_messages set captured_at=$2 where id=$1",
        [sent.messageId, at],
      );
    return sent.messageId;
  }
  async function extract(message: string, gateway: AIGateway) {
    return processExtraction(
      db.pool,
      patient.session,
      await enqueueMessageExtraction(db.pool, patient.session, message),
      gateway,
    );
  }
  async function heads(id: string) {
    return (
      await db.pool.query(
        `select e.*,s.captured_at from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id join mhistree.sources s on s.id=e.source_id join mhistree.chat_messages m on m.id=s.chat_message_id where m.conversation_id=$1 order by s.captured_at,e.version`,
        [id],
      )
    ).rows;
  }
  async function question(
    id: string,
    text: string,
    subject = "belly pain",
    kind = "symptom",
  ) {
    await db.pool.query(
      `insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,dialogue,reply_to) values($1,$2,$3,$4,'assistant',$5,'Africa/Lagos',$6,(select id from mhistree.chat_messages where conversation_id=$2 and role='patient' order by sequence desc limit 1))`,
      [
        randomUUID(),
        id,
        patient.personId,
        patient.accountId,
        text,
        {
          topic: "health",
          decision: "clarification",
          question: { kind, subject },
        },
      ],
    );
  }
  it("supplies actual nullable identity, refreshes it on retry and rejects in-flight profile changes", async () => {
    await db.pool.query(
      "update mhistree.persons set display_name='Ada Example',birth_date='1994-05-06' where id=$1",
      [patient.personId],
    );
    const id = await chat(),
      message = await say(id, "What is my name and birth date?");
    let calls = 0;
    await expect(
      generateReply(db.pool, patient.session, message, {
        generate: async (system) => {
          calls++;
          expect(system).toContain(
            '"profile":{"name":"Ada Example","birthDate":"1994-05-06"}',
          );
          expect(system).not.toContain(other.personId);
          await db.pool.query(
            "update mhistree.persons set display_name='Ada Changed',birth_date=null,profile_version=profile_version+1 where id=$1",
            [patient.personId],
          );
          return "Stale name";
        },
      }),
    ).rejects.toThrow("VERSION_CONFLICT");
    expect(
      (await conversationHistory(db.pool, patient.session, id)).items,
    ).toHaveLength(1);
    await generateReply(db.pool, patient.session, message, {
      generate: async (system) => {
        calls++;
        expect(system).toContain(
          '"profile":{"name":"Ada Changed","birthDate":null}',
        );
        return "Ada Changed; your birth date is unavailable.";
      },
    });
    expect(calls).toBe(2);
  });
  it("retains three sources of a repeated sleep observation as one logical record and recalls across chats", async () => {
    const id = await chat();
    for (const [index, text] of [
      "I had trouble sleeping last night.",
      "I mean that same sleepless night.",
      "Yes, that same sleepless night was difficult.",
    ].entries()) {
      const rows = await heads(id),
        prior = rows[0];
      await extract(
        await say(id, text),
        adapter([
          observation(text, {
            text: "had trouble sleeping during that night.",
            bodySite: null,
            status: "unknown",
            timePhrase:
              index === 2
                ? "that same sleepless night"
                : index
                  ? ""
                  : "last night",
            relation: prior
              ? {
                  kind: "same-report",
                  eventId: prior.id,
                  referenceQuote: "that same sleepless night",
                }
              : null,
          }),
        ]),
      );
    }
    const rows = await heads(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(3);
    expect(
      (
        await db.pool.query(
          "select count(*)::int n from mhistree.contributions where logical_id=$1",
          [rows[0].logical_id],
        )
      ).rows[0].n,
    ).toBe(3);
    for (const request of [
      "Read my timeline",
      "Check my timeline",
      "How have I been sleeping?",
    ]) {
      const next = await chat();
      await generateReply(db.pool, patient.session, await say(next, request), {
        generate: async (system) => {
          expect(system).toContain("trouble sleeping");
          expect(system).toContain("last night");
          return "You mentioned trouble sleeping that night. How has sleep been since?";
        },
      });
    }
  });
  it("a later resolution creates a linked event with unknown stop time, preserving the morning observation and retries", async () => {
    const id = await chat(),
      morning = "My belly hurts this morning.";
    await extract(
      await say(id, morning, "2026-10-28T07:00:00Z"),
      adapter([observation(morning, { timePhrase: "this morning" })]),
    );
    const original = (await heads(id))[0],
      evening = "That belly pain from this morning has stopped.";
    const msg = await say(id, evening, "2026-10-28T19:00:00Z");
    const model = adapter([
      observation(evening, {
        status: "resolved",
        relation: {
          kind: "same-report",
          eventId: original.id,
          referenceQuote: "That belly pain from this morning",
        },
      }),
    ]);
    expect((await extract(msg, model)).state).toBe("succeeded");
    const rows = await heads(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(original);
    expect(rows[1].body.contextLinks).toEqual([original.id]);
    expect(rows[1].body.episodeUpdate.eventId).toBe(original.id);
    expect(rows[1].occurred_at.precision).toBe("unknown");
    expect(rows[1].operation_kind).toBe("accept");
    const evidence = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "belly pain",
    );
    expect(
      evidence.evidence.find((e) => e.id === original.id)?.latestEpisodeReport
        ?.status,
    ).toBe("resolved");
    expect(evidence.evidence.find((e) => e.id === original.id)?.status).toBe(
      "active",
    );
    const repeated = "I meant that same report: the belly pain stopped.";
    expect(
      (
        await extract(
          await say(id, repeated),
          adapter([
            observation(repeated, {
              status: "resolved",
              relation: {
                kind: "same-report",
                eventId: rows[1].id,
                referenceQuote: "that same report",
              },
            }),
          ]),
        )
      ).state,
    ).toBe("succeeded");
    expect(await heads(id)).toHaveLength(2);
    const recalled = await retrieveEvidence(
      db.pool,
      patient.session,
      { kind: "patient" },
      patient.personId,
      "belly pain",
    );
    expect(
      recalled.evidence.find((e) => e.id === original.id)?.latestEpisodeReport
        ?.status,
    ).toBe("resolved");
    const job = await enqueueMessageExtraction(db.pool, patient.session, msg);
    await db.pool.query(
      "update mhistree.extraction_jobs set state='partial' where id=$1",
      [job],
    );
    expect(
      (await processExtraction(db.pool, patient.session, job, model)).state,
    ).toBe("succeeded");
    expect(await heads(id)).toHaveLength(2);
  });
  it("grounds no only in a single exact presence question, never contact, ambiguous, negative or composite questions", async () => {
    for (const [text, kind, accepted] of [
      ["Are you still having belly pain?", "symptom", true],
      ["Shall I help you contact your doctor?", "offer_contact", false],
      ["How is it?", "symptom", false],
      [
        "Are you still thinking of contacting your doctor about belly pain?",
        "symptom",
        false,
      ],
      ["Are you still having belly pain and nausea?", "symptom", false],
      ["Do you still have no belly pain?", "symptom", false],
      ["Is your pain gone?", "symptom", false],
      ["Do you have belly pain or nausea?", "symptom", false],
    ] as const) {
      const id = await chat(),
        first = "I have belly pain.";
      await extract(await say(id, first), adapter([observation(first)]));
      const original = (await heads(id))[0];
      await question(id, text, "belly pain", kind);
      const msg = await say(id, "no");
      const context = await withAccess(
        db.pool,
        patient.session,
        { kind: "patient" },
        (a) => extractionContext(a, msg),
      );
      expect(context.precedingQuestion?.content).toBe(text);
      const raw = {
        items: [
          observation("no", {
            text: "no longer had belly pain when asked.",
            status: "resolved",
            relation: {
              kind: "episode-update",
              eventId: original.id,
              referenceQuote: "no",
            },
          }),
        ],
      };
      expect(validateExtraction(raw, "no", false, context).items.length).toBe(
        accepted ? 1 : 0,
      );
      if (accepted) {
        expect(
          (await extract(msg, { generate: async () => JSON.stringify(raw) }))
            .state,
        ).toBe("succeeded");
        await generateReply(db.pool, patient.session, msg, {
          generate: async (system, history) => {
            expect(system).toContain('"status":"resolved"');
            expect(history.at(-1)?.content).toBe("no");
            return "Glad it has eased. What else is on your mind?";
          },
        });
      }
    }
  });
  it("keeps a separate occurrence separate and applies only an explicit correction to a mistaken fact", async () => {
    const id = await chat(),
      text = "I had belly pain on 2026-10-26.";
    await extract(
      await say(id, text),
      adapter([observation(text, { timePhrase: "2026-10-26" })]),
    );
    const original = (await heads(id))[0],
      recurrence = "I had belly pain again on 2026-10-27.";
    await extract(
      await say(id, recurrence),
      adapter([
        observation(recurrence, {
          timePhrase: "2026-10-27",
          status: "recurrent",
        }),
      ]),
    );
    expect(await heads(id)).toHaveLength(2);
    const correction = "I meant chest pain, not belly pain, on 2026-10-26.";
    expect(
      (
        await extract(
          await say(id, correction),
          adapter([
            observation(correction, {
              bodySite: "chest",
              timePhrase: "2026-10-26",
              relation: {
                kind: "correction",
                eventId: original.id,
                referenceQuote: "I meant chest pain, not belly pain",
              },
            }),
          ]),
        )
      ).state,
    ).toBe("succeeded");
    const rows = await heads(id);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.logical_id === original.logical_id).version).toBe(
      2,
    );
    expect(
      validateExtraction(
        {
          items: [
            observation("Could I have pain?", { evidence: "hypothetical" }),
          ],
        },
        "Could I have pain?",
      ).items,
    ).toHaveLength(0);
  });

  it("grounds a new-chat no in one identified earlier episode while refusing competing episodes", async () => {
    const old = await chat(),
      text = "My elbow hurts.";
    await extract(
      await say(old, text),
      adapter([observation(text, { bodySite: "elbow" })]),
    );
    const prior = (await heads(old))[0];
    const next = await chat();
    await say(next, "Hello");
    await question(next, "Are you still having elbow pain?", "elbow");
    const msg = await say(next, "no");
    expect(
      (
        await extract(
          msg,
          adapter([
            observation("no", {
              text: "no longer had elbow pain when asked.",
              bodySite: "elbow",
              status: "resolved",
              relation: {
                kind: "episode-update",
                eventId: prior.id,
                referenceQuote: "no",
              },
            }),
          ]),
        )
      ).state,
    ).toBe("succeeded");
    expect((await heads(old))[0]).toEqual(prior);
    expect((await heads(next))[0].body.contextLinks).toEqual([prior.id]);
    const separate = await chat();
    await extract(
      await say(separate, "I have elbow pain again."),
      adapter([observation("I have elbow pain again.", { bodySite: "elbow" })]),
    );
    const ambiguous = await chat();
    await say(ambiguous, "Hello");
    await question(ambiguous, "Are you still having elbow pain?", "elbow");
    const answer = await say(ambiguous, "no");
    const context = await withAccess(
      db.pool,
      patient.session,
      { kind: "patient" },
      (a) => extractionContext(a, answer),
    );
    expect(context.reports).toHaveLength(0);
  });

  it("rechecks an episode target corrected during generation without accepting a stale update", async () => {
    const id = await chat(),
      text = "My wrist hurts.";
    await extract(
      await say(id, text),
      adapter([observation(text, { bodySite: "wrist" })]),
    );
    const prior = (await heads(id))[0],
      update = "That wrist pain has stopped.";
    const msg = await say(id, update);
    const result = await extract(msg, {
      generate: async () => {
        const correction = "I meant left wrist pain, not right wrist pain.";
        const later = await say(id, correction);
        const source = await recordSource(
          db.pool,
          patient.session,
          { kind: "patient" },
          {
            patientPersonId: patient.personId,
            category: "symptom",
            sourceTimezone: "Africa/Lagos",
            content: correction,
            clientKey: randomUUID(),
            messageId: later,
          },
        );
        await acceptContribution(
          db.pool,
          patient.session,
          { kind: "patient" },
          {
            sourceId: source.sourceId,
            sourceVersion: 1,
            sourceItemId: "correction",
            operationKey: randomUUID(),
            body: { text: "had left wrist pain.", bodySite: "left wrist" },
            occurredAt: prior.occurred_at,
            status: "active",
            sourceSpans: [correction],
            correction: {
              logicalId: prior.logical_id,
              expectedVersion: prior.version,
            },
          },
        );
        return output([
          observation(update, {
            bodySite: "wrist",
            status: "resolved",
            relation: {
              kind: "episode-update",
              eventId: prior.id,
              referenceQuote: "That wrist pain",
            },
          }),
        ]);
      },
    });
    expect(result.state).toBe("partial");
    const rows = await heads(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].version).toBe(2);
    expect(rows[0].status).toBe("active");
  });

  it("keeps retrieval failure distinct from empty history and permits an explicit retry", async () => {
    const id = await chat(),
      msg = await say(id, "Check my timeline");
    let calls = 0;
    const gateway: AIGateway = {
      generate: async () => {
        calls++;
        return "Grounded retry";
      },
    };
    await db.pool.query(
      "alter table mhistree.record_heads rename to unavailable_heads",
    );
    try {
      await expect(
        generateReply(db.pool, patient.session, msg, gateway),
      ).rejects.toThrow();
      expect(calls).toBe(0);
      expect(
        (await conversationHistory(db.pool, patient.session, id)).items,
      ).toHaveLength(1);
    } finally {
      await db.pool.query(
        "alter table mhistree.unavailable_heads rename to record_heads",
      );
    }
    expect(
      (await generateReply(db.pool, patient.session, msg, gateway)).state,
    ).toBe("succeeded");
    expect(calls).toBe(1);
    const denied = await retrieveEvidence(
      db.pool,
      other.session,
      { kind: "patient" },
      patient.personId,
      "belly sleep",
    );
    expect(denied.evidence).toEqual([]);
  });

  it.runIf(process.env.MHISTREE_LIVE_IDENTITY_EPISODES === "1")(
    "five checks through real services with synthetic records and an explicitly selected provider",
    async () => {
      await mkdir(".local/provider-evaluation", { recursive: true });
      const env = {
        ...parseEnv(await readFile(".env", "utf8")),
        ...process.env,
      };
      const provider = process.env.MHISTREE_EVAL_PROVIDER ?? "groq";
      const gateway =
        provider === "nvidia" || provider === "openrouter"
          ? new CompatibleGateway(
              env[
                provider === "nvidia" ? "NVIDIA_API_KEY" : "OPENROUTER_API_KEY"
              ]!,
              provider,
              process.env.MHISTREE_EVAL_MODEL!,
            )
          : new GroqGateway(
              env.GROQ_API_KEY!,
              process.env.MHISTREE_EVAL_MODEL ?? "openai/gpt-oss-20b",
            );
      const interval = provider === "groq" ? 42000 : 2000;
      const samples: unknown[] = [];
      const recordUsage = async () => {
        if (gateway instanceof CompatibleGateway)
          await writeFile(
            ".local/provider-evaluation/services-usage.json",
            JSON.stringify({
              provider,
              model: gateway.modelName,
              ...gateway.observedUsage,
            }),
          );
      };
      let previous = 0;
      const paced: AIGateway = {
        modelName: gateway.modelName,
        generate: async (...args) => {
          const wait = Math.max(0, interval - (Date.now() - previous));
          if (wait) await new Promise((r) => setTimeout(r, wait));
          previous = Date.now();
          const result = await gateway.generate(...args);
          await recordUsage();
          if (provider !== "groq") {
            samples.push({ input: args[1], result: JSON.parse(result) });
            await writeFile(
              ".local/provider-evaluation/services-review.json",
              JSON.stringify(samples, null, 2),
            );
          }
          return result;
        },
        patientReply: async (system, messages, signal) => {
          const wait = Math.max(0, interval - (Date.now() - previous));
          if (wait) await new Promise((r) => setTimeout(r, wait));
          previous = Date.now();
          const result = await gateway.patientReply(system, messages, signal);
          await recordUsage();
          return result;
        },
      };
      await db.pool.query(
        "update mhistree.persons set display_name='Ada Synthetic',birth_date='1994-05-06' where id=$1",
        [patient.personId],
      );
      const identity = await chat();
      await generateReply(
        db.pool,
        patient.session,
        await say(identity, "What is my stored name and birth date?"),
        paced,
      );
      const reply = (
        await conversationHistory(db.pool, patient.session, identity)
      ).items.at(-1)!.content;
      expect(reply).toMatch(/Ada/);
      expect(reply).toMatch(/1994/);
      expect(reply).toMatch(/May|05/);
      const sleep = await chat();
      for (const text of [
        "I had trouble sleeping last night.",
        "I mean that same sleepless night.",
        "Yes, that same sleepless night was difficult.",
      ]) {
        expect((await extract(await say(sleep, text), paced)).state).toBe(
          "succeeded",
        );
      }
      expect(await heads(sleep)).toHaveLength(1);
      const next = await chat();
      await generateReply(
        db.pool,
        patient.session,
        await say(next, "Read my timeline. What did I mention about sleep?"),
        paced,
      );
      expect(
        (await conversationHistory(db.pool, patient.session, next)).items.at(
          -1,
        )!.content,
      ).toMatch(/sleep|night/i);
      await generateReply(
        db.pool,
        patient.session,
        await say(
          next,
          "Check my timeline again — what date was that sleep problem?",
        ),
        paced,
      );
      const recalled = (
        await conversationHistory(db.pool, patient.session, next)
      ).items.at(-1)!.content;
      expect(recalled).toMatch(/sleep|night/i);
      expect(recalled).not.toMatch(
        /no (?:access|ability)|cannot (?:access|read)/i,
      );
      const pain = await chat();
      expect(
        (await extract(await say(pain, "My belly hurts this morning."), paced))
          .state,
      ).toBe("succeeded");
      const original = (await heads(pain))[0];
      expect(
        (
          await extract(
            await say(pain, "That belly pain from this morning has stopped."),
            paced,
          )
        ).state,
      ).toBe("succeeded");
      const rows = await heads(pain);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(original);
      expect(rows[1].status).toBe("resolved");
      expect(rows[1].body.episodeUpdate.eventId).toBe(original.id);
      await generateReply(
        db.pool,
        patient.session,
        await say(
          pain,
          "No more pain. I feel fine and want to talk about my coding project.",
        ),
        paced,
      );
      expect(
        (await conversationHistory(db.pool, patient.session, pain)).items.at(
          -1,
        )!.content,
      ).not.toMatch(
        /(?:still|currently) (?:having|experiencing).*pain|how is (?:your|the) (?:belly|pain)/i,
      );
      const followUp = await chat();
      await say(followUp, "Hello again");
      await question(
        followUp,
        "Do you still have trouble sleeping?",
        "trouble sleeping",
      );
      expect((await extract(await say(followUp, "no"), paced)).state).toBe(
        "succeeded",
      );
      const followUpRows = await heads(followUp);
      expect(followUpRows).toHaveLength(1);
      expect(followUpRows[0].status).toBe("resolved");
      expect((await heads(sleep))[0].status).not.toBe("resolved");
      const hypothetical = await chat();
      expect(
        (
          await extract(
            await say(
              hypothetical,
              "Could jogging cause knee pain? If I took paracetamol would that help? I have not taken it.",
            ),
            paced,
          )
        ).state,
      ).toBe("succeeded");
      expect(await heads(hypothetical)).toHaveLength(0);
      await db.pool.query(
        "update mhistree.persons set birth_date=null,profile_version=profile_version+1 where id=$1",
        [patient.personId],
      );
      const missingDob = await chat();
      await generateReply(
        db.pool,
        patient.session,
        await say(missingDob, "What is my stored birth date?"),
        paced,
      );
      const missingReply = (
        await conversationHistory(db.pool, patient.session, missingDob)
      ).items.at(-1)!.content;
      expect(missingReply).toMatch(
        /(?:not|don.t|unavailable|no |isn.t|missing)/i,
      );
      expect(missingReply).not.toContain("1994");
    },
    600000,
  );
});
