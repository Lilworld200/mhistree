/**
 * POST /api/clinician/verify-memory
 * ─────────────────────────────────────────────────────────────────
 * Clinician Health Memory Verification Endpoint
 *
 * Allows a verified clinician to inspect unverified AI-extracted
 * health memories and mark them as clinician-verified entries in the EHR.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { logAuditEvent } from "@/lib/security/audit";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const VerifyMemorySchema = z.object({
  memory_id: z.string().uuid(),
  clinician_id: z.string().uuid(),
  is_verified: z.boolean().default(true),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  let body: z.infer<typeof VerifyMemorySchema>;
  try {
    const json = await req.json();
    body = VerifyMemorySchema.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload. Required: memory_id, clinician_id" },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminSupabaseClient();

    // 1. Update health memory verification status
    const { data: memory, error } = await supabase
      .from("health_memories")
      .update({
        is_verified: body.is_verified,
        verified_by_clinician_id: body.clinician_id,
      })
      .eq("id", body.memory_id)
      .select()
      .single();

    if (error || !memory) {
      return NextResponse.json(
        {
          error: "Memory record not found or update failed",
          details: error?.message,
        },
        { status: 444 },
      );
    }

    // 2. Write security audit log
    await logAuditEvent({
      actorId: body.clinician_id,
      actorRole: "clinician",
      action: "verify_memory",
      patientId: memory.patient_id,
      metadata: {
        memory_id: body.memory_id,
        fact_summary: memory.fact_summary,
        verified: body.is_verified,
      },
    });

    return NextResponse.json({
      success: true,
      verified_memory: memory,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
