import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess } from "@/features/access/server";
import { readPrivateOriginal } from "@/features/access/private-files";
import { recordSource } from "@/features/health-records/server";
import { LocalPrivateStore } from "@/lib/storage/local";
import { DomainError } from "@/lib/errors";
import { inspectUpload, documentParser, type DocumentParser } from "./parser";
import { transaction } from "@/lib/db/client";
import { verifySession } from "@/features/auth/sessions";
export async function uploadDocument(
  pool: Pool,
  session: string,
  input: {
    filename: string;
    mime: string;
    bytes: Uint8Array;
    key: string;
    timezone: string;
  },
  store = new LocalPrivateStore(),
) {
  z.string().min(1).max(200).parse(input.filename);
  z.uuid().parse(input.key);
  const actor = await transaction((tx) => verifySession(tx, session), pool);
  const status = inspectUpload(input.bytes, input.mime);
  const sha = createHash("sha256").update(input.bytes).digest("hex");
  const source = await recordSource(
    pool,
    session,
    { kind: "patient" },
    {
      patientPersonId: actor.personId,
      category: "document",
      sourceTimezone: input.timezone,
      content: JSON.stringify({
        filename: input.filename,
        mime: input.mime,
        sha256: sha,
      }),
      clientKey: input.key,
      uploaded: true,
    },
  );
  const existing = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) =>
      (
        await a.tx.query(
          "select source_id from mhistree.documents where source_id=$1",
          [source.sourceId],
        )
      ).rows[0],
  );
  if (existing) return existing;
  const key = randomUUID();
  await store.write(key, input.bytes);
  // A storage-success/database-failure leaves a recoverable private orphan, never deletes the sole original.
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `upload:${source.sourceId}`,
    ]);
    const prior = (
      await a.tx.query(
        "select source_id from mhistree.documents where source_id=$1",
        [source.sourceId],
      )
    ).rows[0];
    if (prior) return prior;
    await a.tx.query(
      "insert into mhistree.private_files(source_id,storage_key,sha256,byte_length) values($1,$2,$3,$4)",
      [source.sourceId, key, sha, input.bytes.byteLength],
    );
    await a.tx.query(
      "insert into mhistree.documents(source_id,account_id,filename,mime_type,status) values($1,$2,$3,$4,$5)",
      [source.sourceId, a.actor.accountId, input.filename, input.mime, status],
    );
    return { source_id: source.sourceId };
  });
}
export async function documentsList(pool: Pool, session: string) {
  return withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) =>
      (
        await a.tx.query(
          "select source_id,filename,mime_type,status,attempts,error_code,created_at,pages from mhistree.documents order by created_at desc,source_id desc limit 50",
        )
      ).rows,
  );
}
export async function parseDocument(
  pool: Pool,
  session: string,
  id: string,
  parser: DocumentParser = documentParser,
  store = new LocalPrivateStore(),
) {
  z.uuid().parse(id);
  const lease = randomUUID();
  const document = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) =>
      (
        await a.tx.query(
          "update mhistree.documents set status='parsing',attempts=attempts+1,lease_id=$2,lease_until=clock_timestamp()+interval '1 minute',error_code=null where source_id=$1 and attempts<5 and (status in ('queued','failed') or(status='parsing' and lease_until<clock_timestamp())) returning *",
          [id, lease],
        )
      ).rows[0],
  );
  if (!document) return { status: "unchanged" };
  try {
    const bytes = await readPrivateOriginal(
      pool,
      session,
      { kind: "patient" },
      id,
      store,
    );
    const pages = await parser.parse(bytes, document.mime_type);
    return await withAccess(pool, session, { kind: "patient" }, async (a) => {
      const saved = await a.tx.query(
        "update mhistree.documents set status='parsed',pages=$3,lease_until=null where source_id=$1 and lease_id=$2 and status='parsing' returning source_id",
        [id, lease, JSON.stringify(pages)],
      );
      if (!saved.rowCount) throw new DomainError("VERSION_CONFLICT");
      const original = (
        await a.tx.query("select * from mhistree.sources where id=$1", [id])
      ).rows[0];
      const parsedId = randomUUID();
      const content = pages.map((p) => `Page ${p.page}: ${p.text}`).join("\n");
      await a.tx.query(
        "insert into mhistree.sources(id,patient_person_id,origin_person_id,author_account_id,original_context,category,visibility,source_status,source_timezone,content,client_key,captured_at,parent_source_id) values($1,$2,$2,$3,$4,'document','finalized','patient-uploaded',$5,$6,$7,$8,$9)",
        [
          parsedId,
          a.actor.personId,
          a.actor.accountId,
          a.contextId,
          original.source_timezone,
          content,
          randomUUID(),
          original.captured_at,
          id,
        ],
      );
      await a.tx.query(
        "insert into mhistree.extraction_jobs(account_id,document_source_id) values($1,$2)",
        [a.actor.accountId, parsedId],
      );
      return { status: "parsed" };
    });
  } catch (error) {
    try {
      await withAccess(pool, session, { kind: "patient" }, (a) =>
        a.tx.query(
          "update mhistree.documents set status='failed',error_code='PARSER_FAILED',lease_until=null where source_id=$1 and lease_id=$2",
          [id, lease],
        ),
      );
    } catch {}
    throw error;
  }
}
