/**
 * Mhistree Database Type Definitions
 * Auto-maintained: update whenever schema changes in Supabase.
 * These types mirror the tables created in the SQL migration.
 */

/* ────────────────────────────────────────────────────────────────
   ENUMS
   ────────────────────────────────────────────────────────────── */

export type UserRole = "patient" | "clinician" | "admin";
export type VitalType =
  | "blood_pressure"
  | "heart_rate"
  | "glucose"
  | "weight"
  | "temperature"
  | "oxygen_saturation"
  | "respiratory_rate";
export type VitalSource =
  | "patient_reported"
  | "device_sync"
  | "clinician_entry";
export type MedicationStatus = "active" | "discontinued" | "completed";
export type PractitionerType = "doctor" | "nurse" | "pharmacist" | "therapist";
export type ContributorRole = "patient" | "clinician" | "ai_extractor";
export type MemoryCategory =
  | "allergy"
  | "chronic_condition"
  | "family_history"
  | "lifestyle"
  | "symptom_trend"
  | "surgery"
  | "vaccination";
export type MessageRole = "user" | "assistant" | "system" | "clinician_note";

/* ────────────────────────────────────────────────────────────────
   ROW TYPES — mirror Supabase table structures exactly
   ────────────────────────────────────────────────────────────── */

export interface DBUser {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
  email: string;
  phone_number: string | null;
  date_of_birth: string | null; // ISO date string
  emergency_contact: Record<string, unknown> | null;
}

export interface DBHealthProfile {
  id: string;
  user_id: string;
  blood_group: string | null;
  genotype: string | null;
  height: string | null;
  weight: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  family_history: string | null;
  lifestyle: string | null;
  gender: string | null;
  primary_physician_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DBVital {
  id: string;
  patient_id: string;
  recorded_at: string;
  vital_type: VitalType;
  numeric_value: number | null;
  text_value: string | null;
  unit: string | null;
  source: VitalSource;
}

export interface DBHealthPractitioner {
  id: string;
  user_id: string;
  professional_id: string;
  professional_type: PractitionerType;
  specialization: string | null;
  license_number: string | null;
  practice_name: string | null;
  practice_address: string | null;
  practice_phone: string | null;
  practice_email: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface DBMedication {
  id: string;
  patient_id: string;
  rxnorm_code: string | null;
  drug_name: string;
  dosage: string;
  frequency: string;
  status: MedicationStatus;
  prescribed_by: string | null;
  started_at: string | null;
  ended_at: string | null;
}

export interface DBHealthMemory {
  id: string;
  patient_id: string;
  contributor_role: ContributorRole;
  contributor_id: string | null;
  fact_category: MemoryCategory;
  fact_summary: string;
  clinical_payload: Record<string, unknown> | null;
  snomed_code: string | null;
  icd10_code: string | null;
  confidence_score: number;
  is_verified: boolean;
  verified_by_clinician_id: string | null;
  created_at: string;
}

export interface DBChatSession {
  id: string;
  patient_id: string;
  title: string;
  session_group: string;
  created_at: string;
  updated_at: string;
}

export interface DBChatMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  tokens_used: number;
  attachments: AttachmentMeta[];
  created_at: string;
}

export interface DBUserSummary {
  id: string;
  user_id: string;
  summary: string;
  key_metadata: Record<string, unknown> | null;
  version: string;
  created_at: string;
}

export interface DBDocumentChunk {
  id: string;
  patient_id: string;
  document_name: string;
  file_url: string;
  chunk_index: number;
  chunk_text: string;
  // embedding stored server-side only — not returned to client by default
  created_at: string;
}

export interface DBAuditLog {
  id: string;
  actor_id: string;
  actor_role: ContributorRole | "system";
  action: string;
  patient_id: string | null;
  ip_address: string | null;
  timestamp: string;
}

/* ────────────────────────────────────────────────────────────────
   SHARED UTILITY TYPES
   ────────────────────────────────────────────────────────────── */

export interface AttachmentMeta {
  type: "image" | "pdf" | "audio" | "video" | "lab_result";
  url: string;
  name: string;
  size?: number;
}

/** Full patient record hydrated across user + health_profile + memories */
export interface PatientRecord {
  user: DBUser;
  profile: DBHealthProfile | null;
  memories: DBHealthMemory[];
  vitals: DBVital[];
  medications: DBMedication[];
}
