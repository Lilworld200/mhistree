import { NextResponse } from "next/server";

/**
 * GET    /api/timeline        — list events (filters: type, source, range, q)
 * POST   /api/timeline        — append a patient-reported event candidate
 * PATCH  /api/timeline/[id]   — verification state transitions (verify /
 *                               reject / dispute / correct); original records
 *                               are immutable — corrections create new
 *                               provenance-bearing states (ledger rule).
 *
 * Backed by Supabase Postgres tables + RLS scoped to the authenticated
 * patient; clinician access requires an active lease check server-side.
 * Client currently consumes features/timeline/data/seed.ts until wired.
 */
export async function GET() {
  return NextResponse.json(
    { error: "Timeline service not implemented" },
    { status: 501 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Timeline service not implemented" },
    { status: 501 },
  );
}
