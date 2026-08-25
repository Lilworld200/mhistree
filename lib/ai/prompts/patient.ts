/**
 * Patient System Prompt Builder
 * ─────────────────────────────────────────────────────────────────
 * Generates the system prompt for patient AI interactions, injecting
 * the patient's Longitudinal Electronic Health Record (EHR) context.
 */
import type {
  DBHealthMemory,
  DBVital,
  DBMedication,
  DBHealthProfile,
} from "@/lib/supabase/types";

export interface PatientContext {
  name: string;
  profile: DBHealthProfile | null;
  memories: DBHealthMemory[];
  recentVitals: DBVital[];
  activeMedications: DBMedication[];
}

export function buildPatientSystemPrompt(ctx: PatientContext): string {
  const { name, profile, memories, recentVitals, activeMedications } = ctx;

  const profileLines: string[] = [];
  if (profile) {
    if (profile.blood_group)
      profileLines.push(`Blood Group: ${profile.blood_group}`);
    if (profile.genotype) profileLines.push(`Genotype: ${profile.genotype}`);
    if (profile.gender) profileLines.push(`Gender: ${profile.gender}`);
    if (profile.allergies)
      profileLines.push(`Known Allergies: ${profile.allergies}`);
    if (profile.chronic_conditions)
      profileLines.push(`Chronic Conditions: ${profile.chronic_conditions}`);
    if (profile.family_history)
      profileLines.push(`Family History: ${profile.family_history}`);
  }

  const verifiedMemories = memories.filter((m) => m.is_verified);
  const unverifiedMemories = memories.filter((m) => !m.is_verified);
  const fmtMemory = (m: DBHealthMemory) =>
    `  - [${m.fact_category.replaceAll("_", " ")}] ${m.fact_summary}${m.icd10_code ? ` (ICD-10: ${m.icd10_code})` : ""}`;

  const vitalLines = recentVitals.slice(0, 8).map((v) => {
    const date = new Date(v.recorded_at).toLocaleDateString();
    const value =
      v.numeric_value != null
        ? `${v.numeric_value} ${v.unit || ""}`.trim()
        : (v.text_value ?? "N/A");
    return `  - ${v.vital_type.replaceAll("_", " ")}: ${value} (${date}, ${v.source})`;
  });

  const medLines = activeMedications.map(
    (m) =>
      `  - ${m.drug_name} ${m.dosage}, ${m.frequency}${m.rxnorm_code ? ` [RxNorm: ${m.rxnorm_code}]` : ""}`,
  );

  return `You are Mhistree AI — an empathetic, clinically-informed personal health assistant.
You are speaking with ${name}.

Your purpose: Help ${name} understand and track their health. Ask clarifying questions to surface health-relevant details. When you detect medically significant information (symptoms, vitals, medication changes, allergies), summarize what you've learned and confirm it for the patient's health record.

IMPORTANT GUIDELINES:
- You are NOT a replacement for a doctor. Always recommend consulting a qualified clinician for diagnoses or treatment decisions.
- When you detect a new health fact, end your response with: 🧠 Memory noted: [brief fact]. This will be saved to their health record.
- Use compassionate, plain language. Avoid jargon unless the patient uses it first.
- If the patient mentions an emergency, immediately advise them to call emergency services (999 / 112 / 911).

<PATIENT_LONGITUDINAL_RECORD patient="${name}">
${profileLines.length > 0 ? `HEALTH PROFILE:\n${profileLines.map((l) => `  - ${l}`).join("\n")}` : "Health profile: Not yet set up."}

VERIFIED HEALTH MEMORIES (clinician-confirmed):
${verifiedMemories.length > 0 ? verifiedMemories.map(fmtMemory).join("\n") : "  - None recorded yet."}

UNVERIFIED HEALTH MEMORIES (AI-extracted, pending clinician review):
${unverifiedMemories.length > 0 ? unverifiedMemories.map(fmtMemory).join("\n") : "  - None."}

RECENT VITALS:
${vitalLines.length > 0 ? vitalLines.join("\n") : "  - No vitals recorded yet."}

ACTIVE MEDICATIONS:
${medLines.length > 0 ? medLines.join("\n") : "  - No active medications on file."}
</PATIENT_LONGITUDINAL_RECORD>

Respond naturally. Prioritize the patient record above but do not read it out verbatim.`;
}
