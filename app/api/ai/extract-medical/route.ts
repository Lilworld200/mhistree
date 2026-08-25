/**
 * POST /api/ai/extract-medical
 * ─────────────────────────────────────────────────────────────────
 * Medical Entity & Fact Extraction Engine
 *
 * Takes raw clinical/patient conversation text and uses structured LLM output
 * to extract SNOMED CT, ICD-10, and RxNorm-aligned medical facts, vitals,
 * and medications.
 *
 * Optionally persists extracted records directly to Supabase when patient_id is provided.
 */
import { NextResponse } from "next/server";
import { generateObject } from "ai";
import DOMPurify from "isomorphic-dompurify";
import { z } from "zod";
import { getModel } from "@/lib/ai/providers";
import { MedicalExtractionSchema } from "@/lib/ai/schemas/extraction";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const RequestBodySchema = z.object({
  text: z.string().min(3).max(10_000),
  patient_id: z.string().uuid().optional(),
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
          "Invalid payload format. Expected { text, patient_id?, contributor_role? }",
      },
      { status: 400 },
    );
  }

  // Sanitize input text using DOMPurify
  const cleanText = DOMPurify.sanitize(body.text);

  try {
    // Generate structured extraction using Vercel AI SDK + OpenRouter model
    const extractionResult = await generateObject({
      model: getModel("extraction"),
      schema: MedicalExtractionSchema,
      prompt: `You are a clinical NLP entity extraction engine for an Electronic Health Record (EHR) system.
Analyze the following patient or clinician text and extract all structured health facts, symptoms, vitals, and medications:

"${cleanText}"

Map diseases and findings to SNOMED CT / ICD-10-CM codes where possible, and medications to RxNorm codes. Be accurate and conservative with confidence scores.`,
    });

    const extraction = extractionResult.object;

    // Optional persistence to Supabase if patient_id is present
    if (body.patient_id) {
      const supabase = createAdminSupabaseClient();

      // Persist health memories
      if (extraction.memories.length > 0) {
        await supabase.from("health_memories").insert(
          extraction.memories.map((m) => ({
            patient_id: body.patient_id!,
            contributor_role: body.contributor_role,
            fact_category: m.fact_category,
            fact_summary: m.fact_summary,
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
            patient_id: body.patient_id!,
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

      // Persist medications
      if (extraction.medications.length > 0) {
        await supabase.from("medications").insert(
          extraction.medications.map((med) => ({
            patient_id: body.patient_id!,
            drug_name: med.drug_name,
            dosage: med.dosage,
            frequency: med.frequency,
            rxnorm_code: med.rxnorm_code ?? null,
            status: med.status,
          })),
        );
      }
    }

    return NextResponse.json({
      success: true,
      extraction,
      persisted: !!body.patient_id,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json(
      { error: "Failed to extract medical entities", details: errorMsg },
      { status: 500 },
    );
  }
}
