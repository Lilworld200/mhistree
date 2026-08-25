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
]);

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
          "Optional metadata object with ONLY details the text supports, e.g. { occurred_at: 'this morning', severity: 'mild', body_part: 'left toe', trigger: 'cold weather', related_readings: { blood_pressure: '135/85' } }",
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
      drug_name: z.string().describe("Generic or brand name of medication"),
      dosage: z.string().describe("e.g. 500mg, 10ml, 1 tablet"),
      frequency: z
        .string()
        .describe("e.g. twice daily, once at bedtime, as needed"),
      rxnorm_code: z
        .string()
        .optional()
        .describe("Matching RxNorm code if identifiable"),
      status: z.enum(["active", "discontinued", "completed"]).default("active"),
    }),
  ),
});

export type MedicalExtraction = z.infer<typeof MedicalExtractionSchema>;
