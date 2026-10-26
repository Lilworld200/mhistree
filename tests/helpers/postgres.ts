import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

export async function testDatabase() {
  const socket = createServer();
  await new Promise<void>((res) => socket.listen(0, "127.0.0.1", res));
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>((res) => socket.close(() => res()));
  const folder = resolve(
    ".local",
    `postgres-${randomBytes(8).toString("hex")}`,
  );
  await mkdir(folder, { recursive: true });
  const password = randomBytes(32).toString("hex");
  const server = new EmbeddedPostgres({
    databaseDir: folder,
    user: "postgres",
    password,
    port,
    persistent: true,
    authMethod: "scram-sha-256",
    initdbFlags: ["--encoding=UTF8"],
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await server.initialise();
  let stop = () => server.stop();
  if (process.platform === "win32") {
    // pg_ctl uses PostgreSQL's supported restricted Windows token. Do not run
    // postgres.exe with the elevated desktop process's token or create an OS user.
    const require = createRequire(import.meta.url);
    const packageRequire = createRequire(require.resolve("embedded-postgres"));
    const binaries = await import(
      pathToFileURL(packageRequire.resolve("@embedded-postgres/windows-x64"))
        .href
    );
    const run = (args: string[]) =>
      new Promise<void>((done, reject) => {
        const child = spawn(binaries.pg_ctl, args, {
          windowsHide: true,
          stdio: "ignore",
        });
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0
            ? done()
            : reject(
                new Error(`pg_ctl failed (${code}); inspect local server.log`),
              ),
        );
      });
    await run([
      "-D",
      folder,
      "-l",
      resolve(folder, "server.log"),
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "start",
    ]);
    stop = async () => {
      await run(["-D", folder, "-m", "fast", "-w", "stop"]);
    };
  } else {
    await server.start();
  }
  const pool = new Pool({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
    max: 6,
  });
  const lockPool = new Pool({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password,
    database: "postgres",
    max: 2,
    connectionTimeoutMillis: 5000,
  });
  try {
    for (const file of (await readdir("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await pool.query(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
  } catch (error) {
    await lockPool.end();
    await pool.end();
    await stop();
    throw error;
  }
  return {
    pool,
    lockPool,
    stop: async () => {
      await lockPool.end();
      await pool.end();
      await stop();
    },
  };
}
