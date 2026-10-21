// Local visual QA only. A fresh native database and synthetic session are mandatory.
// The proxy blocks all provider authentication endpoints; no email is sent.
import { testDatabase } from "../tests/helpers/postgres.ts";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createServer, request } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
const db = await testDatabase();
const personId = randomUUID();
const accountId = randomUUID();
const actor = { session: randomBytes(32).toString("base64url") };
await db.pool.query(
  "insert into mhistree.persons(id,display_name,original_context) values($1,'Synthetic Onboarding Reviewer','synthetic-preview')",
  [personId],
);
await db.pool.query(
  "insert into mhistree.accounts(id,person_id,provider,provider_subject,login_identifier,status) values($1,$2,'synthetic-preview',$1::uuid::text,$1::uuid::text,'active')",
  [accountId, personId],
);
await db.pool.query(
  "insert into mhistree.sessions(digest,account_id,session_epoch,provider_session_id,provider_token_digest,expires_at) values($1,$2,0,'synthetic','synthetic',clock_timestamp()+interval '1 hour')",
  [createHash("sha256").update(actor.session).digest("hex"), accountId],
);
await mkdir(".local", { recursive: true });
const log = createWriteStream(".local/professional-preview.log");
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    require.resolve("next/dist/bin/next"),
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3104",
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://postgres:${db.pool.options.password}@127.0.0.1:${db.pool.options.port}/postgres`,
      DATABASE_SSL: "local",
      APP_ORIGIN: "http://127.0.0.1:3105",
      AUTH_DEBUG: "0",
      AI_DEBUG: "0",
    },
  },
);
child.stdout?.pipe(log, { end: false });
child.stderr?.pipe(log, { end: false });
let finish: () => void = () => {};
const finished = new Promise<void>((resolve) => {
  finish = resolve;
});
const proxy = createServer((incoming, outgoing) => {
  if (
    incoming.url === "/__preview/stop" &&
    incoming.method === "POST" &&
    !incoming.headers.origin
  ) {
    outgoing.end("Stopping synthetic preview");
    finish();
    return;
  }
  if (incoming.url === "/__preview/login") {
    outgoing.writeHead(303, {
      "Set-Cookie": `mhistree-session=${actor.session}; HttpOnly; SameSite=Lax; Path=/`,
      Location: "/auth/professional/practitioner",
    });
    outgoing.end();
    return;
  }
  if (incoming.url === "/__preview/logout") {
    outgoing.writeHead(303, {
      "Set-Cookie": "mhistree-session=; Max-Age=0; Path=/",
      Location: "/auth/professional/signup?entry=practitioner",
    });
    outgoing.end();
    return;
  }
  if (
    incoming.url?.startsWith("/api/auth/") ||
    incoming.url?.startsWith("/api/chat")
  ) {
    outgoing.writeHead(503, { "Content-Type": "application/json" });
    outgoing.end(
      JSON.stringify({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } }),
    );
    return;
  }
  const upstream = request(
    {
      hostname: "127.0.0.1",
      port: 3104,
      path: incoming.url,
      method: incoming.method,
      headers: { ...incoming.headers, host: "127.0.0.1:3105" },
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );
  upstream.on("error", () => {
    outgoing.writeHead(502);
    outgoing.end();
  });
  incoming.pipe(upstream);
});
try {
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(3105, "127.0.0.1", resolve);
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw Error("Preview exited");
    try {
      if ((await fetch("http://127.0.0.1:3104/auth")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw Error("Preview did not become ready");
  console.info(
    "Synthetic professional preview ready at http://127.0.0.1:3105; provider endpoints blocked. POST /__preview/stop without Origin to clean up.",
  );
  process.once("SIGINT", finish);
  process.once("SIGTERM", finish);
  await finished;
} finally {
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  if (child.exitCode === null) {
    const stopped = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    child.kill();
    await stopped;
  }
  log.end();
  await db.stop();
}
