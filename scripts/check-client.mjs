import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) =>
        e.isDirectory()
          ? files(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      ),
    )
  ).flat();
}
const bad = [];
for (const file of await files(".next/static")) {
  if (!file.endsWith(".js")) continue;
  const text = await readFile(file, "utf8");
  if (
    /SUPABASE_SERVICE_ROLE_KEY|CLERK_SECRET_KEY|DATABASE_URL|AUTH_CLIENT_SECRET|GEMINI_API_KEY|MHISTREE_SECRET_CANARY/.test(
      text,
    )
  )
    bad.push(file);
}
if (bad.length)
  throw new Error(
    "Server-only identifier or canary found in client bundle: " +
      bad.join(", "),
  );
console.log("Client bundle scan passed (server identifiers/canary absent).");
