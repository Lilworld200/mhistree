import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

// Opt-in synthetic acceptance journey against the isolated local app only.
const origin = "http://127.0.0.1:3101";
const cookies = new Map<string, string>();
async function request(path: string, body?: unknown) {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(";", 1)[0];
    const position = pair.indexOf("=");
    cookies.set(pair.slice(0, position), pair.slice(position + 1));
  }
  return response;
}
async function api(path: string, body?: unknown) {
  const response = await request(path, body);
  const result = await response.json();
  assert.equal(
    result.ok,
    true,
    `${path}: HTTP ${response.status}, ${result.error?.code ?? "invalid envelope"}`,
  );
  return result.data;
}
assert.equal((await request("/api/account")).status, 401);
const protectedPage = await request("/chat");
assert.ok(
  protectedPage.status === 307 ||
    (await protectedPage.text()).includes("NEXT_REDIRECT"),
  "patient page must redirect to authentication",
);
const name = `Synthetic HTTP ${randomUUID()}`;
const password = randomBytes(24).toString("base64url");
await api("/api/auth/signup", {
  displayName: name,
  requestKey: randomBytes(32).toString("base64url"),
});
const setup = await api("/api/auth/setup", { password });
await api("/api/auth/login", { identifier: setup.loginIdentifier, password });
await api("/api/account");
console.log(
  "PASS real HTTP registration, password setup, login and protected account",
);
const conversationId = randomUUID();
await api("/api/chat", { action: "create", data: { id: conversationId } });
const send = {
  conversationId,
  requestKey: randomUUID(),
  content: "Yesterday I ran for 20 minutes. My left leg hurt afterward.",
  timezone: "Africa/Lagos",
};
const message = await api("/api/chat", { action: "send", data: send });
assert.equal(
  (await api("/api/chat", { action: "send", data: send })).messageId,
  message.messageId,
);
const jobs = await api("/api/extraction");
assert.ok(jobs.length > 0);
await api("/api/extraction", { id: jobs[0].id });
await api("/api/chat", { action: "generate", data: { id: message.messageId } });
const timeline = await api("/api/records");
assert.ok(
  timeline.items.length >= 2,
  "clear activity and symptom must persist",
);
await api("/api/health");
const reported = timeline.items.find(
  (item: { category: string }) => item.category === "symptom",
);
assert.ok(reported);
await api("/api/health", {
  action: "correct",
  data: {
    eventId: reported.id,
    version: reported.version,
    requestKey: randomUUID(),
    text: "My right leg hurt after running yesterday.",
    bodySite: "right leg",
    status: "unknown",
  },
});
assert.equal((await request(`/records/${reported.id}`)).status, 200);
await api("/api/assessment", {
  conversationId,
  requestKey: randomUUID(),
  timezone: "Africa/Lagos",
});
console.log(
  "PASS durable chat replay, real AI extraction/reply, timeline and health reads",
);
const document = await api("/api/documents", {
  action: "upload",
  data: {
    filename: "synthetic.txt",
    mime: "text/plain",
    base64: Buffer.from(`Patient: ${name}\nI ran yesterday.`).toString(
      "base64",
    ),
    key: randomUUID(),
    timezone: "Africa/Lagos",
  },
});
await api("/api/documents", {
  action: "parse",
  data: { id: document.source_id },
});
assert.equal(
  (await request(`/api/documents/${document.source_id}`)).status,
  200,
);
await api("/api/connections");
await api("/api/care");
const exported = await request("/api/export");
assert.equal(exported.status, 200);
assert.ok((await exported.json()).records.length >= 3);
console.log(
  "PASS private original upload/parse/download, controls, care and export transports",
);
await api("/api/auth/logout", {});
assert.equal((await request("/api/account")).status, 401);
assert.equal(
  (await request(`/api/documents/${document.source_id}`)).status,
  401,
);
console.log("PASS logout retires protected account and original-file access");
