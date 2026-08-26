/**
 * Medical NLP Entity Extraction Schemas (Zod)
 * ─────────────────────────────────────────────────────────────────
 * Enforces structured schema extraction for SNOMED CT, ICD-10-CM,
 * and RxNorm aligned health facts, vitals, and medications.
 */
import { z } from "zod";

export const FactCategoryEnum = z.enum([
  "allergy",
  "chronic_condition",
  "family_history",
  "lifestyle",
  "symptom_trend",
  "surgery",
  "vaccination",
  "diagnosis",
  "medication",
  "treatment",
  "other",
]);

export const SeverityEnum = z
  .enum(["none", "mild", "moderate", "severe", "unknown"])
  .default("unknown");

export const VitalTypeEnum = z.enum([
  "blood_pressure",
  "heart_rate",
  "glucose",
  "weight",
  "temperature",
  "oxygen_saturation",
]);

export const MedicalExtractionSchema = z.object({
  memories: z.array(
    z.object({
      fact_category: FactCategoryEnum,
      fact_summary: z
        .string()
        .describe(
          "Clear clinical summary statement, e.g. Patient experiences intermittent migraines triggered by stress",
        ),
      severity: SeverityEnum.describe(
        "Weighted clinical severity of this fact per the rubric provided in the prompt. Use 'unknown' only when there is genuinely not enough information to weigh it.",
      ),
      clarity_score: z
        .number()
        .min(0)
        .max(1)
        .default(0)
        .describe(
          "0.0–1.0: how completely specified this fact is. Below 0.5 means critical specifics (e.g. medication name, diagnosis source) are missing and the companion should keep asking before anything is stored.",
        ),
      missing_details: z
        .array(z.string())
        .default([])
        .describe(
          "Exactly what is still unknown, phrased as short follow-up questions or missing fields, e.g. ['exact drug name', 'dosage per dose']. Empty when clarity_score >= 0.5.",
        ),
      snomed_code: z
        .string()
        .optional()
        .describe("Matching SNOMED CT code if identifiable, e.g. 37796009"),
      icd10_code: z
        .string()
        .optional()
        .describe("Matching ICD-10-CM code if identifiable, e.g. G43.909"),
      confidence_score: z
        .number()
        .min(0)
        .max(1)
        .default(0.9)
        .describe("Confidence rating between 0.0 and 1.0"),
      clinical_payload: z
        .record(z.string(), z.unknown())
        .nullable()
        .optional()
        .describe(
          "Optional metadata object with ONLY details the text supports, e.g. { occurred_at: 'this morning', body_part: 'left toe', trigger: 'cold weather', related_readings: { blood_pressure: '135/85' } }",
        ),
    }),
  ),
  vitals: z.array(
    z.object({
      vital_type: VitalTypeEnum,
      numeric_value: z.number().nullable().optional(),
      text_value: z
        .string()
        .nullable()
        .optional()
        .describe("e.g. '120/80' for blood pressure"),
      unit: z.string().optional().describe("e.g. mmHg, bpm, mg/dL, kg, C, %"),
    }),
  ),
  medications: z.array(
    z.object({
      drug_name: z
        .string()
        .describe(
          "Generic (INN) name resolved from brand names or misspellings, e.g. 'Coartem' → 'artemether-lumefantrine', 'panadol' → 'paracetamol'. Only use 'Unidentified …' when NO drug can be resolved.",
        ),
      dosage: z.string().describe("e.g. 500mg, 10ml, 1 tablet"),
      frequency: z
        .string()
        .describe("e.g. twice daily, once at bedtime, as needed"),
      duration: z
        .string()
        .default("unknown")
        .describe(
          "Total course length or quantity if stated, e.g. 'for 5 days', '10 tablets'. Use 'unknown' when not mentioned.",
        ),
      clarity_score: z
        .number()
        .min(0)
        .max(1)
        .default(0)
        .describe(
          "0.0–1.0: how fully specified the medication is. A named drug with dose and frequency scores high; 'malaria medicine' without a name must score below 0.5.",
        ),
      missing_details: z
        .array(z.string())
        .default([])
        .describe(
          "Missing specifics to ask about next, e.g. ['drug name', 'strength per tablet'].",
        ),
      rxnorm_code: z
        .string()
        .optional()
        .describe("Matching RxNorm code if identifiable"),
      status: z.enum(["active", "discontinued", "completed"]).default("active"),
      clinical_payload: z
        .record(z.string(), z.unknown())
        .nullable()
        .optional()
        .describe(
          "Optional metadata with ONLY details the text supports, e.g. { brand_name: 'Coartem', taken_with_food: true }",
        ),
      trust_score: z
        .number()
        .min(0)
        .max(100)
        .default(50)
        .describe(
          "0–100: confidence % that this specific drug and regimen is actually what the patient SHOULD be taking (not just that they mentioned it). 100 = explicitly prescribed by a named doctor with drug name/dose confirmed. 50 = plausible inference from context. 10 = highly uncertain guess.",
        ),
      inferred_by: z
        .enum(["doctor", "ai_inferred", "self_reported", "pharmacist"])
        .default("ai_inferred")
        .describe(
          "Who determined this medication: 'doctor' if the patient says a doctor/clinic prescribed it; 'self_reported' if the patient bought it themselves OTC; 'pharmacist' if dispensed by a pharmacist without doctor; 'ai_inferred' if we are inferring the drug class from symptoms/description without a clear human source.",
        ),
    }),
  ),
});

export type MedicalExtraction = z.infer<typeof MedicalExtractionSchema>;
