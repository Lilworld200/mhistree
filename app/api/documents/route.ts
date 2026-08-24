import { NextResponse } from "next/server";

/**
 * GET  /api/documents       — list documents + extraction status.
 * POST /api/documents       — multipart upload → Supabase Storage → insert
 *                             job row (background worker picks up:
 *                             parse → extract facts → pgvector embed → link
 *                             to ledger candidates). Source file is immutable
 *                             and preserved regardless of extraction outcome.
 */
export async function GET() {
  return NextResponse.json({ error: "Documents not implemented" }, { status: 501 });
}

export async function POST() {
  return NextResponse.json({ error: "Documents not implemented" }, { status: 501 });
}
