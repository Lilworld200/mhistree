/** Synthetic local app database only. Never loads a legacy database URL or hosted Supabase configuration. */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { testDatabase } from "../tests/helpers/postgres.ts";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const configurationPath = resolve(".local/app-database.json");
let connection: Record<string, unknown>;
try {
  connection = JSON.parse(await readFile(configurationPath, "utf8"));
  const pool = new Pool({ ...connection, connectionTimeoutMillis: 2000 });
  try {
    await pool.query("select 1");
  } catch {
    const { folder } = JSON.parse(
      await readFile(".local/app-database-directory.json", "utf8"),
    );
    if (
      !resolve(folder).startsWith(resolve(".local") + "\\postgres-") ||
      connection.host !== "127.0.0.1" ||
      !Number.isInteger(connection.port)
    )
      throw new Error(
        "Local database metadata is outside its expected workspace.",
      );
    if (process.platform !== "win32")
      throw new Error(
        "Start the saved PostgreSQL cluster before preparing the local app.",
      );
    const require = createRequire(import.meta.url);
    const packageRequire = createRequire(require.resolve("embedded-postgres"));
    const binaries = await import(
      pathToFileURL(packageRequire.resolve("@embedded-postgres/windows-x64"))
        .href
    );
    await new Promise<void>((done, reject) => {
      const child = spawn(
        binaries.pg_ctl,
        [
          "-D",
          folder,
          "-l",
          resolve(".local", "app-postgres.log"),
          "-o",
          `-h 127.0.0.1 -p ${connection.port}`,
          "-w",
          "start",
        ],
        { windowsHide: true, stdio: "ignore" },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? done()
          : reject(new Error("Local PostgreSQL restart failed.")),
      );
    });
  } finally {
    await pool.end();
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT")
    throw new Error(
      "Saved local database is unavailable. Start its PostgreSQL instance; do not silently replace it.",
    );
  const db = await testDatabase();
  connection = {
    host: db.pool.options.host,
    port: db.pool.options.port,
    user: db.pool.options.user,
    password: db.pool.options.password,
    database: db.pool.options.database,
  };
  const folder = (await db.pool.query("show data_directory")).rows[0]
    .data_directory;
  await writeFile(configurationPath, JSON.stringify(connection));
  await writeFile(
    ".local/app-database-directory.json",
    JSON.stringify({ folder }),
  );
  await db.pool.query(
    "create table mhistree.local_migration_history(name text primary key)",
  );
  for (const name of (await readdir("supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.pool.query(
      "insert into mhistree.local_migration_history values($1)",
      [name],
    );
  await db.pool.end();
}
const pool = new Pool(connection);
for (const name of (await readdir("supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  if (
    !(
      await pool.query(
        "select 1 from mhistree.local_migration_history where name=$1",
        [name],
      )
    ).rowCount
  ) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(await readFile(`supabase/migrations/${name}`, "utf8"));
      await client.query(
        "insert into mhistree.local_migration_history values($1)",
        [name],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
await pool.end();
let ai: Record<string, string> = {};
try {
  ai = JSON.parse(await readFile(".local/ai-config.json", "utf8"));
} catch {
  /* AI can be configured separately in .env. */
}
const values = {
  DATABASE_URL: `postgresql://${connection.user}:${encodeURIComponent(String(connection.password))}@127.0.0.1:${connection.port}/${connection.database}`,
  DATABASE_SSL: "local",
  APP_ORIGIN: "http://127.0.0.1:3101",
  ...ai,
};
await writeFile(
  ".env.local",
  Object.entries(values)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join("\n") + "\n",
);
console.log(
  "Local synthetic database ready; private environment saved. No hosted database contacted.",
);
