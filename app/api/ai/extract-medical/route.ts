/**
 * POST /api/ai/extract-medical
 * ─────────────────────────────────────────────────────────────────
 * Medical Entity & Fact Extraction Engine
 *
 * Takes raw clinical/patient conversation text and uses structured LLM output
 * to extract SNOMED CT, ICD-10, and RxNorm-aligned medical facts, vitals,
 * and medications.
 *
 * Requires an authenticated Supabase session — extracted records are persisted
 * for the signed-in patient (guests receive 401 and never touch the database).
 */
import { NextResponse } from "next/server";
import DOMPurify from "isomorphic-dompurify";
import { z } from "zod";
import { ai } from "@/lib/ai/gateway";
import { MedicalExtractionSchema } from "@/lib/ai/schemas/extraction";
import { persistExtractedMedications } from "@/lib/server/medication-persistence";
import { logAuditEvent } from "@/lib/security/audit";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

const RequestBodySchema = z.object({
  text: z.string().min(3).max(10_000),
  contributor_role: z
    .enum(["patient", "clinician", "ai_extractor"])
    .default("ai_extractor"),
});

export async function POST(req: Request) {
  let body: z.infer<typeof RequestBodySchema>;
  try {
    const rawJson = await req.json();
    body = RequestBodySchema.parse(rawJson);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid payload format. Expected { text, contributor_role? }",
      },
      { status: 400 },
    );
  }

  // Identity is derived from the auth session cookie — guests never persist.
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  const patientId = user.id;

  // Sanitize input text using DOMPurify
  const cleanText = DOMPurify.sanitize(body.text);

  try {
    // Generate structured extraction via Mhistree LLM Gateway
    const extraction = await ai.structured("extraction", {
      prompt: `You are a clinical NLP entity extraction engine for an Electronic Health Record (EHR) system.
Analyze the following patient or clinician text and extract all structured health facts, symptoms, vitals, and medications:

"${cleanText}"

Map diseases and findings to SNOMED CT / ICD-10-CM codes where possible, and medications to RxNorm codes. Be accurate and conservative with confidence scores.`,
      schema: MedicalExtractionSchema,
      validate: (data: unknown) => MedicalExtractionSchema.parse(data),
    });

    // Persist extracted records to Supabase
    const supabase = createAdminSupabaseClient();

    // Persist health memories
    if (extraction.memories.length > 0) {
      await supabase.from("health_memories").insert(
        extraction.memories.map((m) => ({
          patient_id: patientId,
          contributor_role: body.contributor_role,
          fact_category: m.fact_category,
          fact_summary: m.fact_summary,
          clinical_payload: {
            ...(m.clinical_payload ?? {}),
            source_text: cleanText,
          },
          snomed_code: m.snomed_code,
          icd10_code: m.icd10_code,
          confidence_score: m.confidence_score,
          is_verified: body.contributor_role === "clinician",
        })),
      );
    }

    // Persist vitals
    if (extraction.vitals.length > 0) {
      await supabase.from("health_vitals").insert(
        extraction.vitals.map((v) => ({
          patient_id: patientId,
          vital_type: v.vital_type,
          numeric_value: v.numeric_value ?? null,
          text_value: v.text_value ?? null,
          unit: v.unit ?? null,
          source:
            body.contributor_role === "clinician"
              ? "clinician_entry"
              : "patient_reported",
        })),
      );
    }

    // Persist medications (shared upsert + dual health_memories write with
    // dynamic trust scoring — skips "Unidentified …" placeholders)
    if (extraction.medications.length > 0) {
      await persistExtractedMedications(
        supabase,
        patientId,
        extraction.medications,
        [{ role: "user", content: cleanText }],
      );
    }

    await logAuditEvent({
      actorId: patientId,
      actorRole:
        body.contributor_role === "clinician" ? "clinician" : "patient",
      action: "extract_memory",
      patientId,
      metadata: {
        memoriesExtracted: extraction.memories.length,
        vitalsExtracted: extraction.vitals.length,
        medicationsExtracted: extraction.medications.length,
      },
    });

    return NextResponse.json({
      success: true,
      extraction,
      persisted: true,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json(
      { error: "Failed to extract medical entities", details: errorMsg },
      { status: 500 },
    );
  }
}
