import { NextRequest, NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { logAuditEvent } from "@/lib/security/audit";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export interface TimelineEventResponse {
  id: string;
  category: "symptom" | "vitals" | "medication" | "lab" | "clinical_note";
  title: string;
  summary: string;
  timestamp: string;
  source:
    | "patient_reported"
    | "clinician_entry"
    | "ai_extracted"
    | "device_sync";
  verified: boolean;
  code?: string;
  verifiedBy?: string;
}

/**
 * GET /api/timeline?patient_id=... — Fetch longitudinal timeline events
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

  try {
    const supabase = createAdminSupabaseClient();

    // Fetch memories, vitals, and medications concurrently
    const [memoriesRes, vitalsRes, medsRes] = await Promise.all([
      supabase
        .from("health_memories")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("health_vitals")
        .select("*")
        .eq("patient_id", patientId)
        .order("recorded_at", { ascending: false }),
      supabase
        .from("medications")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
    ]);

    const events: TimelineEventResponse[] = [];

    // Map health memories
    (memoriesRes.data || []).forEach((mem) => {
      events.push({
        id: `mem_${mem.id}`,
        category: mem.fact_category === "allergy" ? "symptom" : "clinical_note",
        title: mem.fact_summary,
        summary: `Category: ${mem.fact_category.replaceAll("_", " ")}${mem.snomed_code ? ` (SNOMED: ${mem.snomed_code})` : ""}`,
        timestamp: mem.created_at,
        source:
          mem.contributor_role === "clinician"
            ? "clinician_entry"
            : mem.contributor_role === "ai_extractor"
              ? "ai_extracted"
              : "patient_reported",
        verified: mem.is_verified,
        code: mem.snomed_code || mem.icd10_code || undefined,
        verifiedBy: mem.verified_by_clinician_id || undefined,
      });
    });

    // Map vitals
    (vitalsRes.data || []).forEach((v) => {
      const valStr =
        v.numeric_value != null
          ? `${v.numeric_value} ${v.unit || ""}`.trim()
          : (v.text_value ?? "N/A");
      events.push({
        id: `vital_${v.id}`,
        category: "vitals",
        title: `${v.vital_type.replaceAll("_", " ").toUpperCase()}: ${valStr}`,
        summary: `Source: ${v.source || "patient_reported"}`,
        timestamp: v.recorded_at,
        source:
          (v.source as TimelineEventResponse["source"]) || "patient_reported",
        verified: v.source === "clinician_entry" || v.source === "device_sync",
      });
    });

    // Map medications
    (medsRes.data || []).forEach((m) => {
      events.push({
        id: `med_${m.id}`,
        category: "medication",
        title: `Medication: ${m.drug_name} (${m.dosage})`,
        summary: `Frequency: ${m.frequency} — Status: ${m.status}`,
        timestamp: m.created_at,
        source: "clinician_entry",
        verified: true,
        code: m.rxnorm_code || undefined,
      });
    });

    // Sort all timeline events chronologically descending (newest first)
    events.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return NextResponse.json({
      success: true,
      events,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Timeline fetch error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/timeline — Insert a new timeline event entry (patient or clinician)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const patientId = body.patient_id;
    const factSummary = DOMPurify.sanitize(
      body.fact_summary || body.title || "",
    );
    const factCategory = body.fact_category || "symptom_trend";
    const role = body.contributor_role || "patient";

    if (!patientId || !factSummary) {
      return NextResponse.json(
        { error: "patient_id and fact_summary are required" },
        { status: 400 },
      );
    }

    const supabase = createAdminSupabaseClient();
    const { data: memory, error } = await supabase
      .from("health_memories")
      .insert({
        patient_id: patientId,
        contributor_role: role,
        fact_category: factCategory,
        fact_summary: factSummary,
        confidence_score: 1.0,
        is_verified: role === "clinician",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logAuditEvent({
      actorId: patientId,
      actorRole: role === "clinician" ? "clinician" : "patient",
      action: "extract_memory",
      patientId,
      metadata: { memory_id: memory.id, summary: factSummary },
    });

    return NextResponse.json({
      success: true,
      memory,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Timeline insert error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
