// Opt-in real HTTP/model verification. All clinical data and sessions are synthetic;
// DATABASE_URL is always overridden to a fresh native PostgreSQL test cluster.
import { testDatabase } from "../tests/helpers/postgres.ts";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const source =
  "I ate a lot of food last night and my belly is swollen up this morning.";
const db = await testDatabase();
await mkdir(".local", { recursive: true });
const terminal = createWriteStream(".local/meal-terminal.log");
let server: ReturnType<typeof spawn> | undefined;
const stages: object[] = [];
const result: Record<string, unknown> = {
  synthetic: true,
  source,
  embeddingUsed: false,
};
try {
  const person = randomUUID(),
    account = randomUUID(),
    conversation = randomUUID();
  const session = randomBytes(32).toString("base64url");
  await db.pool.query(
    "insert into mhistree.persons(id,display_name,original_context) values($1,'Synthetic Meal Test',$2)",
    [person, `patient:${person}`],
  );
  await db.pool.query(
    "insert into mhistree.accounts(id,person_id,provider,provider_subject,login_identifier,status) values($1,$2,'synthetic-test',$1::uuid::text,$1::uuid::text,'active')",
    [account, person],
  );
  await db.pool.query(
    "insert into mhistree.sessions(digest,account_id,session_epoch,provider_session_id,provider_token_digest,expires_at) values($1,$2,0,'synthetic','synthetic',clock_timestamp()+interval '1 hour')",
    [createHash("sha256").update(session).digest("hex"), account],
  );
  const origin = "http://127.0.0.1:3103";
  server = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3103",
    ],
    {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://postgres:${db.pool.options.password}@127.0.0.1:${db.pool.options.port}/postgres`,
        DATABASE_SSL: "local",
        APP_ORIGIN: origin,
        AI_DEBUG: "1",
        AUTH_DEBUG: "0",
      },
    },
  );
  server.stdout?.pipe(terminal, { end: false });
  server.stderr?.pipe(terminal, { end: false });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null)
      throw new Error(
        "Synthetic preview exited; inspect .local/meal-terminal.log",
      );
    try {
      const r = await fetch(`${origin}/auth`);
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, "Synthetic preview did not start");
  async function call(path: string, body?: object) {
    const started = Date.now();
    const response = await fetch(`${origin}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        cookie: `mhistree-session=${session}`,
        origin,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await response.json();
    const stage = {
      path: path.split("?")[0],
      action: (body as { action?: string })?.action,
      status: response.status,
      state: json.data?.state,
      elapsedMs: Date.now() - started,
      error: json.error?.code,
    };
    stages.push(stage);
    console.info(stage);
    assert(
      response.ok && json.ok,
      `HTTP stage failed: ${path.split("?")[0]} ${json.error?.code}`,
    );
    return json.data;
  }
  const before = await call("/api/records");
  assert.equal(before.items.length, 0);
  await call("/api/chat", { action: "create", data: { id: conversation } });
  const saved = await call("/api/chat", {
    action: "send",
    data: {
      conversationId: conversation,
      requestKey: randomUUID(),
      content: source,
      timezone: "Africa/Lagos",
    },
  });
  const extraction = await call("/api/extraction", {
    messageId: saved.messageId,
  });
  result.extraction = extraction;
  const jobs = await call("/api/extraction");
  const job = jobs.find(
    (j: { message_id: string }) => j.message_id === saved.messageId,
  );
  result.processing = job ? { state: job.state, issues: job.issues } : null;
  const page = await call("/api/records");
  result.records = page.items.map((e: Record<string, unknown>) => ({
    category: e.category,
    body: e.body,
    occurredAt: e.occurred_at,
    capturedAt: e.captured_at,
    sourceStatus: e.source_status,
  }));
  const sym = page.items.find(
    (e: { category: string }) => e.category === "symptom",
  );
  const activity = page.items.find(
    (e: { category: string }) => e.category === "activity",
  );
  assert(
    sym && activity,
    "Expected both food/activity and swollen-belly patient reports",
  );
  assert.equal(sym.source_status, "patient-reported");
  const generated = await call("/api/chat", {
    action: "generate",
    data: { id: saved.messageId },
  });
  result.replyState = generated.state;
  const history = await call(`/api/chat?id=${conversation}`);
  assert(history.items.some((e: { role: string }) => e.role === "assistant"));
  const otherSession = randomBytes(32).toString("base64url");
  const denied = await fetch(`${origin}/api/records`, {
    headers: { cookie: `mhistree-session=${otherSession}` },
  });
  assert.equal(denied.status, 401);
  result.isolationDenied = true;
  assert.equal(sym.body.contextLinks[0], activity.id);
  assert.equal(sym.occurred_at.precision, "approximate");
  assert.equal(activity.occurred_at.precision, "approximate");
  assert(
    Date.parse(sym.occurred_at.from) > Date.parse(activity.occurred_at.from),
  );
  result.passed = true;
} catch (error) {
  result.passed = false;
  result.failure =
    error instanceof assert.AssertionError
      ? error.message
      : "Stage failed; inspect metadata log";
  throw error;
} finally {
  result.stages = stages;
  await writeFile(
    ".local/meal-pipeline-result.json",
    JSON.stringify(result, null, 2),
  );
  if (server && server.exitCode === null) {
    const stopped = new Promise<void>((r) => server!.once("exit", () => r()));
    server.kill();
    await stopped;
  }
  await new Promise<void>((r) => terminal.end(r));
  await db.stop();
}
