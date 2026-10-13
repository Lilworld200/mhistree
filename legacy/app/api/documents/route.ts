import { NextRequest, NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { parseDocumentContent } from "@/lib/documents/parser";
import { ingestDocumentChunks } from "@/lib/ai/rag";
import { logAuditEvent } from "@/lib/security/audit";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

/**
 * GET  /api/documents — List uploaded medical documents for a patient
 * POST /api/documents — Process document upload/ingestion, chunk, embed, & save
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patient_id");

  if (!patientId) {
    return NextResponse.json(
      { error: "patient_id query parameter is required" },
      { status: 400 },
    );
  }

  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("medical_document_chunks")
    .select("document_id, document_name, created_at, metadata")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Deduplicate chunks to present document-level list
  const docMap = new Map<
    string,
    {
      document_id: string;
      document_name: string;
      created_at: string;
      chunk_count: number;
    }
  >();

  (data || []).forEach((row) => {
    const existing = docMap.get(row.document_id);
    if (existing) {
      existing.chunk_count += 1;
    } else {
      docMap.set(row.document_id, {
        document_id: row.document_id,
        document_name: row.document_name,
        created_at: row.created_at,
        chunk_count: 1,
      });
    }
  });

  return NextResponse.json({
    documents: Array.from(docMap.values()),
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    let patientId = "";
    let documentName = "";
    let rawText = "";

    // 1. Multipart Form Data (File Upload)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      patientId = formData.get("patient_id") as string;
      documentName =
        (formData.get("document_name") as string) || "Medical Document";

      const file = formData.get("file") as File | null;
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const parsed = await parseDocumentContent(
          buffer,
          file.type || "application/octet-stream",
          file.name || documentName,
        );
        rawText = parsed.text;
        if (!documentName || documentName === "Medical Document") {
          documentName = file.name;
        }
      } else {
        rawText = (formData.get("text") as string) || "";
      }
    } else {
      // 2. JSON Body Payload
      const body = await request.json();
      patientId = body.patient_id;
      documentName = body.document_name || "Medical Document";
      rawText = body.text_content || body.text || "";
    }

    if (!patientId || !rawText) {
      return NextResponse.json(
        { error: "patient_id and text content (or file) are required" },
        { status: 400 },
      );
    }

    const cleanText = DOMPurify.sanitize(rawText);
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Ingest chunks into Supabase vector database
    const ingestResult = await ingestDocumentChunks(
      patientId,
      documentId,
      documentName,
      cleanText,
    );

    // Record security audit event
    await logAuditEvent({
      actorId: patientId,
      actorRole: "patient",
      action: "document_ingest",
      patientId: patientId,
      metadata: {
        documentId,
        documentName,
        chunksCount: ingestResult.chunkCount,
      },
    });

    return NextResponse.json({
      success: true,
      document_id: documentId,
      document_name: documentName,
      chunks_ingested: ingestResult.chunkCount,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown document ingestion error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
