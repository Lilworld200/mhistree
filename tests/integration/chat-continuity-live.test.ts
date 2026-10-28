import { afterAll, beforeAll, expect, it } from "vitest";
import { parseEnv } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { GeminiGateway } from "@/lib/ai/gateway";
import { CompatibleGateway } from "@/lib/ai/compatible";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
  listConversations,
} from "@/features/ai-chat/server";
import { prepareMemory, recallMemory } from "@/features/ai-chat/memory";
import { generateTitle } from "@/features/ai-chat/titles";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  if (process.env.MHISTREE_LIVE_AI_TEST === "1") db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
it.runIf(process.env.MHISTREE_LIVE_AI_TEST === "1")(
  "live synthetic summary, topic title and time-aware reply use the configured economical model",
  async () => {
    const env = { ...parseEnv(await readFile(".env", "utf8")), ...process.env };
    const provider = process.env.MHISTREE_EVAL_PROVIDER;
    if (
      !provider &&
      (!env.GEMINI_API_KEY || !env.AI_PATIENT_MODEL || !env.AI_EXTRACTION_MODEL)
    )
      throw new Error("Live test requires explicit provider configuration");
    const gateway =
      provider === "nvidia" || provider === "openrouter"
        ? new CompatibleGateway(
            env[
              provider === "nvidia" ? "NVIDIA_API_KEY" : "OPENROUTER_API_KEY"
            ]!,
            provider,
            process.env.MHISTREE_EVAL_MODEL!,
          )
        : new GeminiGateway({
            key: env.GEMINI_API_KEY!,
            chatModel: env.AI_PATIENT_MODEL!,
            extractionModel: env.AI_EXTRACTION_MODEL!,
          });
    const patient = await staffFixture(db.pool),
      old = randomUUID(),
      next = randomUUID();
    await createConversation(db.pool, patient.session, old);
    const first = await sendMessage(db.pool, patient.session, {
      conversationId: old,
      requestKey: randomUUID(),
      content:
        "Synthetic scenario: I have been coding since morning. My belly feels uncomfortable, and I skipped breakfast.",
      timezone: "Africa/Lagos",
    });
    await db.pool.query(
      "update mhistree.chat_messages set captured_at=clock_timestamp()-interval '12 hours' where id=$1",
      [first.messageId],
    );
    await sendMessage(db.pool, patient.session, {
      conversationId: old,
      requestKey: randomUUID(),
      content:
        "I took a short break and ate. The break helped me feel less tired. I have not said whether the belly discomfort changed.",
      timezone: "Africa/Lagos",
    });
    await generateTitle(db.pool, patient.session, old, gateway);
    await createConversation(db.pool, patient.session, next, old);
    expect(
      await prepareMemory(db.pool, patient.session, next, gateway),
    ).toEqual({ state: "ready" });
    const memory = await recallMemory(
      db.pool,
      patient.session,
      next,
      "coding belly break",
    );
    expect(memory.items.length).toBeGreaterThan(0);
    expect(JSON.stringify(memory.items).toLowerCase()).toContain("coding");
    const sent = await sendMessage(db.pool, patient.session, {
      conversationId: next,
      requestKey: randomUUID(),
      content: "I've finished coding and I'm back for a chat.",
      timezone: "Africa/Lagos",
    });
    expect(
      await generateReply(db.pool, patient.session, sent.messageId, gateway),
    ).toEqual({ state: "succeeded" });
    const reply = (
      await conversationHistory(db.pool, patient.session, next)
    ).items.at(-1)!.content;
    const title = (await listConversations(db.pool, patient.session)).find(
      (c) => c.id === old,
    )!;
    expect(title.titleReady).toBe(true);
    expect(title.title!.length).toBeLessThanOrEqual(64);
    expect(reply.length).toBeGreaterThan(10);
    await writeFile(
      ".local/chat-continuity-live-review.json",
      JSON.stringify(
        {
          model: gateway.modelName,
          usage:
            gateway instanceof CompatibleGateway
              ? gateway.observedUsage
              : undefined,
          title: title.title,
          memory: memory.items,
          reply,
        },
        null,
        2,
      ),
    );
  },
  120000,
);
