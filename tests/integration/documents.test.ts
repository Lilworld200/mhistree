import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  uploadDocument,
  parseDocument,
  documentsList,
} from "@/features/documents/server";
import { readPrivateOriginal } from "@/features/access/private-files";
import { LocalPrivateStore } from "@/lib/storage/local";
import { validateExtraction } from "@/features/ai-chat/extraction/server";
import { documentParser, inspectUpload } from "@/features/documents/parser";
describe("private originals and durable parsing", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    patient: Awaited<ReturnType<typeof staffFixture>>,
    other: Awaited<ReturnType<typeof staffFixture>>;
  const store = new LocalPrivateStore(
    resolve(".local", `document-test-${randomUUID()}`),
  );
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    other = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("parser outage retains original; retry queues one extraction; other patient denied", async () => {
    const bytes = new TextEncoder().encode(
      "Patient: Synthetic reviewer\nI walked yesterday.",
    );
    const input = {
      filename: "synthetic.txt",
      mime: "text/plain",
      bytes,
      key: randomUUID(),
      timezone: "UTC",
    };
    const uploaded = await uploadDocument(
      db.pool,
      patient.session,
      input,
      store,
    );
    expect(
      await uploadDocument(db.pool, patient.session, input, store),
    ).toEqual(uploaded);
    await expect(
      parseDocument(
        db.pool,
        patient.session,
        uploaded.source_id,
        {
          parse: async () => {
            throw new Error("Injected parser outage");
          },
        },
        store,
      ),
    ).rejects.toThrow();
    expect(
      await readPrivateOriginal(
        db.pool,
        patient.session,
        { kind: "patient" },
        uploaded.source_id,
        store,
      ),
    ).toEqual(bytes);
    await expect(
      readPrivateOriginal(
        db.pool,
        other.session,
        { kind: "patient" },
        uploaded.source_id,
        store,
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    await parseDocument(
      db.pool,
      patient.session,
      uploaded.source_id,
      documentParser,
      store,
    );
    await parseDocument(
      db.pool,
      patient.session,
      uploaded.source_id,
      documentParser,
      store,
    );
    expect((await documentsList(db.pool, patient.session))[0].status).toBe(
      "parsed",
    );
    expect(
      Number(
        (await db.pool.query("select count(*) from mhistree.extraction_jobs"))
          .rows[0].count,
      ),
    ).toBe(1);
  });
  it("mismatched patient holds the entire output and ambiguous units are not accepted", () => {
    const item = {
      category: "result",
      text: "Glucose 120",
      quote: "Glucose 120",
      evidence: "document",
      timePhrase: "",
      bodySite: null,
      medicationName: null,
      status: "unknown",
      ambiguity: "Units missing",
      linkQuote: null,
      page: 1,
    };
    const result = validateExtraction(
      { items: [item], clarifications: [], patientMatch: "mismatch" },
      "Glucose 120",
      true,
    );
    expect(result.held).toBe(true);
    expect(result.items).toHaveLength(0);
  });
  it("rejects type deception and quarantines active PDF payloads", () => {
    expect(() =>
      inspectUpload(new TextEncoder().encode("not pdf"), "application/pdf"),
    ).toThrow();
    expect(
      inspectUpload(
        new TextEncoder().encode("%PDF-1.7\n/OpenAction /JavaScript"),
        "application/pdf",
      ),
    ).toBe("quarantined");
  });
  it("extracts readable text from an actual PDF original", async () => {
    const stream =
      "BT /F1 12 Tf 40 100 Td (Synthetic document parser check) Tj ET";
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach((obj, index) => {
      offsets.push(Buffer.byteLength(pdf));
      pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const pages = await documentParser.parse(
      new Uint8Array(Buffer.from(pdf)),
      "application/pdf",
    );
    expect(pages[0].text).toContain("Synthetic document parser check");
  });
});
