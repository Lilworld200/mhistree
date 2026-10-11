/**
 * POST /api/documents/ingest
 * ─────────────────────────────────────────────────────────────────
 * Multimodal Medical Document RAG Ingestion Pipeline
 *
 * Accepts document text or file metadata, chunks text into semantic windows,
 * generates vector embeddings, and stores them in pgvector (`medical_document_chunks`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestDocumentChunks } from "@/lib/ai/rag";

const IngestRequestSchema = z.object({
  patient_id: z.string().uuid(),
  document_name: z.string().min(1),
  file_url: z.string().url().or(z.string().min(1)),
  text_content: z
    .string()
    .min(10, "Document text must be at least 10 characters"),
});

export async function POST(req: Request) {
  let body: z.infer<typeof IngestRequestSchema>;
  try {
    const rawJson = await req.json();
    body = IngestRequestSchema.parse(rawJson);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid payload. Required: patient_id, document_name, file_url, text_content",
      },
      { status: 400 },
    );
  }

  try {
    const result = await ingestDocumentChunks(
      body.patient_id,
      body.document_name,
      body.file_url,
      body.text_content,
    );

    return NextResponse.json({
      success: true,
      document_name: body.document_name,
      chunks_ingested: result.chunkCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ingestion failed";
    return NextResponse.json(
      { error: "Failed to ingest document chunks", details: msg },
      { status: 500 },
    );
  }
}
