import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
  listConversations,
} from "@/features/ai-chat/server";
import { prepareMemory, recallMemory } from "@/features/ai-chat/memory";
import { generateTitle } from "@/features/ai-chat/titles";
import { withAccess } from "@/features/access/server";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import type { AIGateway } from "@/lib/ai/gateway";

describe("private patient continuity and topic titles", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    other: typeof patient;
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  async function chat(previous?: string) {
    const id = randomUUID();
    await createConversation(db.pool, patient.session, id, previous);
    return id;
  }
  async function say(id: string, content: string) {
    return sendMessage(db.pool, patient.session, {
      conversationId: id,
      requestKey: randomUUID(),
      content,
      timezone: "Africa/Lagos",
    });
  }
  const summarize: AIGateway = {
    modelName: "synthetic-small-model",
    generate: async (_system, messages) => {
      const sources = JSON.parse(messages[0].content);
      return JSON.stringify({
        items: sources.map(
          (s: { id: string; role: string; content: string }) => ({
            kind: s.role === "patient" ? "life-context" : "ai-advice",
            text: s.content.slice(0, 300),
            citations: [{ messageId: s.id, quote: s.content.slice(0, 300) }],
          }),
        ),
      });
    },
  };
  it("prepares before a new reply, keeps life context and source clocks, resumes without duplicates", async () => {
    const old = await chat();
    const sent = await say(
      old,
      "I have been coding since morning and took a break.",
    );
    await db.pool.query(
      "update mhistree.chat_messages set captured_at='2026-10-26T08:00:00Z' where id=$1",
      [sent.messageId],
    );
    await generateReply(db.pool, patient.session, sent.messageId, {
      generate: async () => "Rest your eyes for a while.",
    });
    const next = await chat(old);
    const question = await say(next, "Back again tonight.");
    await expect(
      generateReply(db.pool, patient.session, question.messageId, {
        generate: async () => "Must wait",
      }),
    ).rejects.toThrow("MEMORY_PREPARATION_REQUIRED");
    await expect(
      prepareMemory(db.pool, patient.session, next, {
        generate: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("offline");
    expect(
      (await conversationHistory(db.pool, patient.session, next)).items[0]
        .content,
    ).toBe("Back again tonight.");
    expect(
      await prepareMemory(db.pool, patient.session, next, summarize),
    ).toEqual({ state: "ready" });
    const memory = await recallMemory(db.pool, patient.session, next, "coding");
    expect(
      memory.items.find((i) => i.kind === "life-context")?.sources[0]
        .capturedAt,
    ).toBe("2026-10-26T08:00:00.000Z");
    expect(memory.items.some((i) => i.kind === "ai-advice")).toBe(true);
    let prompt = "";
    await generateReply(db.pool, patient.session, question.messageId, {
      generate: async (s) => {
        prompt = s;
        return "How did the break feel?";
      },
    });
    expect(prompt).toContain("currentTime");
    expect(prompt).toContain("coding since morning");
    expect(prompt).toContain("never patient actions");
    expect(
      await prepareMemory(db.pool, patient.session, next, {
        generate: async () => {
          throw new Error("must not repeat");
        },
      }),
    ).toEqual({ state: "ready" });
    expect(
      (
        await db.pool.query(
          "select count(*)::int count from mhistree.chat_memory_chunks where conversation_id=$1",
          [old],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await db.pool.query(
          "select count(*)::int count from mhistree.contributions",
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it("allows explicit limited memory without inventing recall and never backfills unrelated chats", async () => {
    const unrelated = await chat();
    await say(unrelated, "Unrelated old secret");
    const old = await chat();
    await say(old, "Current departure");
    const next = await chat(old);
    const sent = await say(next, "Hello again");
    let prompt = "";
    await generateReply(
      db.pool,
      patient.session,
      sent.messageId,
      {
        generate: async (s) => {
          prompt = s;
          return "Hello";
        },
      },
      undefined,
      true,
    );
    expect(prompt).toContain('"limitedMemory":true');
    expect(prompt).not.toContain("Unrelated old secret");
    expect(
      (
        await db.pool.query(
          "select * from mhistree.chat_memory_chunks where conversation_id=$1",
          [unrelated],
        )
      ).rowCount,
    ).toBe(0);
  });
  it("chunks long chats durably and prevents duplicate work across tabs", async () => {
    const old = await chat();
    for (let i = 0; i < 3; i++) await say(old, `${i} ${"x".repeat(8500)}`);
    const next = await chat(old);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((r) => (release = r)),
      claimed = new Promise<void>((r) => (started = r));
    const pending = prepareMemory(db.pool, patient.session, next, {
      generate: async (...args) => {
        started();
        await gate;
        return summarize.generate(...args);
      },
    });
    await claimed;
    expect(
      await prepareMemory(db.pool, patient.session, next, summarize),
    ).toEqual({ state: "running" });
    release();
    expect(await pending).toEqual({ state: "pending" });
    expect(
      await prepareMemory(db.pool, patient.session, next, summarize),
    ).toEqual({ state: "pending" });
    expect(
      await prepareMemory(db.pool, patient.session, next, summarize),
    ).toEqual({ state: "ready" });
    expect(
      (
        await db.pool.query(
          "select count(*)::int count from mhistree.chat_memory_chunks where conversation_id=$1",
          [old],
        )
      ).rows[0].count,
    ).toBe(3);
  });
  it("rejects invented citations and assistant advice labeled as a patient report", async () => {
    const old = await chat();
    const first = await say(old, "I am taking a break.");
    await generateReply(db.pool, patient.session, first.messageId, {
      generate: async () => "Try water.",
    });
    const next = await chat(old);
    await expect(
      prepareMemory(db.pool, patient.session, next, {
        generate: async (_s, m) => {
          const rows = JSON.parse(m[0].content);
          return JSON.stringify({
            items: [
              {
                kind: "patient-report",
                text: "Patient drank water",
                citations: [{ messageId: rows[1].id, quote: "Try water." }],
              },
            ],
          });
        },
      }),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    await expect(
      prepareMemory(db.pool, patient.session, next, {
        generate: async (_s, m) =>
          JSON.stringify({
            items: [
              {
                kind: "life-context",
                text: "Invented",
                citations: [
                  {
                    messageId: JSON.parse(m[0].content)[0].id,
                    quote: "not actually said",
                  },
                ],
              },
            ],
          }),
      }),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  });
  it("carries unfinished preparation through successive empty new chats without cycles", async () => {
    const old = await chat();
    await say(old, "Life context from the departing chat");
    const middle = await chat(old);
    const newest = await chat(middle);
    expect(
      await prepareMemory(db.pool, patient.session, newest, summarize),
    ).toEqual({ state: "pending" });
    expect(
      await prepareMemory(db.pool, patient.session, newest, summarize),
    ).toEqual({ state: "ready" });
    expect(
      (
        await recallMemory(db.pool, patient.session, newest, "Life context")
      ).items.some((i) => i.text.includes("departing chat")),
    ).toBe(true);
    await expect(
      createConversation(db.pool, patient.session, old, newest),
    ).rejects.toThrow("VERSION_CONFLICT");
  });
  it("validates root-array JSON summaries just like wrapped items", async () => {
    const old = await chat();
    await say(old, "I prefer short replies");
    const next = await chat(old);
    expect(
      await prepareMemory(db.pool, patient.session, next, {
        generate: async (...args) =>
          JSON.stringify(JSON.parse(await summarize.generate(...args)).items),
      }),
    ).toEqual({ state: "ready" });
    expect(
      (
        await recallMemory(db.pool, patient.session, next, "replies")
      ).items.some((i) => i.text.includes("short replies")),
    ).toBe(true);
  });
  it("keeps summaries and titles private across accounts and practitioner contexts", async () => {
    const old = await chat();
    await say(old, "Private weekend routine");
    const next = await chat(old);
    await prepareMemory(db.pool, patient.session, next, summarize);
    await expect(
      prepareMemory(db.pool, other.session, next, summarize),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      recallMemory(db.pool, other.session, next, "routine"),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      createConversation(db.pool, other.session, randomUUID(), old),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      generateTitle(db.pool, other.session, old, summarize),
    ).rejects.toThrow("ACCESS_DENIED");
    await withAccess(db.pool, other.session, { kind: "patient" }, async (a) => {
      for (const table of [
        "chat_memory_chunks",
        "chat_memory_jobs",
        "chat_memory_links",
        "chat_titles",
      ])
        expect(
          (await a.tx.query(`select * from mhistree.${table}`)).rowCount,
        ).toBe(0);
    });
    await withAccess(
      db.pool,
      patient.session,
      { kind: "patient" },
      async (a) => {
        await a.tx.query("select set_config('mhistree.context',$1,true)", [
          JSON.stringify({
            kind: "direct",
            practitionerAccountId: patient.accountId,
          }),
        ]);
        expect(
          (await a.tx.query("select * from mhistree.chat_memory_chunks"))
            .rowCount,
        ).toBe(0);
      },
    );
  });
  it("provides immediate previews and names once after two patient messages; naming failures preserve replies", async () => {
    const id = await chat();
    await say(id, "I am tired after coding");
    let calls = 0;
    const title: AIGateway = {
      generate: async () => {
        calls++;
        return "Rest after a coding day";
      },
    };
    expect(
      (await listConversations(db.pool, patient.session)).find(
        (c) => c.id === id,
      )?.title,
    ).toBe("I am tired after coding");
    await generateTitle(db.pool, patient.session, id, title);
    expect(calls).toBe(0);
    const sent = await say(id, "A break helped a little");
    await generateReply(db.pool, patient.session, sent.messageId, {
      generate: async () => "Glad you took a pause.",
    });
    await expect(
      generateTitle(db.pool, patient.session, id, {
        generate: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("offline");
    expect(
      (await conversationHistory(db.pool, patient.session, id)).items.at(-1)
        ?.role,
    ).toBe("assistant");
    await generateTitle(db.pool, patient.session, id, title);
    await generateTitle(db.pool, patient.session, id, title);
    expect(calls).toBe(1);
    expect(
      (await listConversations(db.pool, patient.session)).find(
        (c) => c.id === id,
      ),
    ).toMatchObject({ title: "Rest after a coding day", titleReady: true });
  });
  it("invalidates superseded health recall and withholds an in-flight response after correction", async () => {
    const old = await chat();
    const sent = await say(old, "My belly hurt this morning.");
    const source = await recordSource(
      db.pool,
      patient.session,
      { kind: "patient" },
      {
        patientPersonId: patient.personId,
        category: "symptom",
        sourceTimezone: "Africa/Lagos",
        content: "My belly hurt this morning.",
        messageId: sent.messageId,
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
        sourceItemId: "pain",
        operationKey: randomUUID(),
        body: { text: "had belly pain" },
        occurredAt: { precision: "unknown" },
        status: "unknown",
        sourceSpans: ["belly hurt"],
      },
    );
    const logical = (
      await db.pool.query(
        "select logical_id from mhistree.contributions where id=$1",
        [event.eventId],
      )
    ).rows[0].logical_id;
    const next = await chat(old);
    await prepareMemory(db.pool, patient.session, next, summarize);
    expect(
      (await recallMemory(db.pool, patient.session, next, "belly")).items.some(
        (i) => i.text.includes("belly"),
      ),
    ).toBe(true);
    const question = await say(next, "How about earlier?");
    await expect(
      generateReply(db.pool, patient.session, question.messageId, {
        generate: async () => {
          const correction = await recordSource(
            db.pool,
            patient.session,
            { kind: "patient" },
            {
              patientPersonId: patient.personId,
              category: "symptom",
              sourceTimezone: "UTC",
              content: "Actually that was last year",
              clientKey: randomUUID(),
            },
          );
          await acceptContribution(
            db.pool,
            patient.session,
            { kind: "patient" },
            {
              sourceId: correction.sourceId,
              sourceVersion: 1,
              sourceItemId: "correction",
              operationKey: randomUUID(),
              body: { text: "had belly pain last year" },
              occurredAt: { precision: "unknown", originalPhrase: "last year" },
              status: "unknown",
              sourceSpans: ["last year"],
              correction: { logicalId: logical, expectedVersion: 1 },
            },
          );
          return "Outdated response must not publish";
        },
      }),
    ).rejects.toThrow("ACCESS_REVOKED");
    expect(
      (await recallMemory(db.pool, patient.session, next, "belly")).items.some(
        (i) => i.text.includes("belly"),
      ),
    ).toBe(false);
    expect(
      (await conversationHistory(db.pool, patient.session, next)).items.some(
        (m) => m.role === "assistant",
      ),
    ).toBe(false);
  });
  it("does not publish memory after session retirement", async () => {
    const fresh = await staffFixture(db.pool);
    const old = randomUUID(),
      next = randomUUID();
    await createConversation(db.pool, fresh.session, old);
    await sendMessage(db.pool, fresh.session, {
      conversationId: old,
      requestKey: randomUUID(),
      content: "Synthetic private routine",
      timezone: "UTC",
    });
    await createConversation(db.pool, fresh.session, next, old);
    await expect(
      prepareMemory(db.pool, fresh.session, next, {
        generate: async (...args) => {
          await db.pool.query(
            "update mhistree.sessions set retired_at=clock_timestamp() where account_id=$1",
            [fresh.accountId],
          );
          return summarize.generate(...args);
        },
      }),
    ).rejects.toThrow();
    expect(
      (
        await db.pool.query(
          "select * from mhistree.chat_memory_chunks where conversation_id=$1",
          [old],
        )
      ).rowCount,
    ).toBe(0);
  });
});
