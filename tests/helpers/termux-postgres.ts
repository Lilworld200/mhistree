import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

/** Android has native Termux PostgreSQL, not an embedded-postgres binary package. Synthetic only. */
export async function termuxTestDatabase() {
  const socket = createServer();
  await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((r) => socket.close(() => r()));
  const folder = resolve(
    ".local",
    `postgres-${randomBytes(8).toString("hex")}`,
  );
  const data = resolve(folder, "data"),
    password = randomBytes(32).toString("hex");
  await mkdir(folder, { recursive: true });
  const pwfile = resolve(folder, "password");
  await writeFile(pwfile, password, { mode: 0o600 });
  function run(command: string, args: string[]) {
    return new Promise<void>((done, reject) => {
      const child = spawn(command, args, { stdio: "ignore" });
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? done()
          : reject(new Error(`Synthetic ${command} failed (${code})`)),
      );
    });
  }
  await run("initdb", [
    "-D",
    data,
    "-U",
    "postgres",
    "--pwfile",
    pwfile,
    "--auth=scram-sha-256",
    "--encoding=UTF8",
    "--locale=C",
  ]);
  await run("pg_ctl", [
    "-D",
    data,
    "-l",
    resolve(folder, "server.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${folder}`,
    "-w",
    "start",
  ]);
  const options = {
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
  };
  const pool = new Pool({ ...options, max: 6 }),
    lockPool = new Pool({ ...options, max: 2, connectionTimeoutMillis: 5000 });
  const stop = async () => {
    await lockPool.end();
    await pool.end();
    await run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  };
  try {
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await pool.query(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return { pool, lockPool, stop };
}
