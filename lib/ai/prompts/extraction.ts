/**
 * Medical Entity Extraction Prompt Builder
 * ────────────────────────────────────────────────────────
 * Produces the detailed instruction prompt for the background health-fact
 * extractor. Two rubrics are enforced here and mirrored by server-side
 * gating in app/api/ai/chat/route.ts:
 *
 *   • CLARITY (0–1)  — how completely specified a fact is. Only facts
 *     scoring >= 0.5 are ever stored; vaguer items carry `missing_details`
 *     so the companion knows what to ask next.
 *   • SEVERITY       — weighted clinical seriousness of the fact.
 */

export interface ExtractionTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

const CATEGORY_DEFINITIONS = `CATEGORIES — pick exactly one per memory item:
- diagnosis: A named illness or condition the patient HAS or WAS TOLD they have (e.g. malaria, typhoid, hypertension, asthma). Includes acute infections confirmed by anyone medically credible (doctor, nurse, lab test).
- chronic_condition: Long-term/ongoing conditions explicitly framed as ongoing (diabetes, sickle cell, HIV, epilepsy).
- medication: A specific drug the patient is taking, was given, or bought (prescribed OR self-medicated). Requires attention to whether the actual drug is identifiable.
- treatment: Non-drug care events (physiotherapy sessions, counselling, dressing changes, IV fluids, hospital admission).
- allergy: Substances that trigger adverse reactions in this patient.
- family_history: Diseases affecting blood relatives, not the patient.
- lifestyle: Sleep, diet, exercise, alcohol/tobacco, stress, occupation hazards.
- symptom_trend: Symptoms the patient experiences (pattern, triggers, frequency) WITHOUT a confirmed named cause.
- surgery: Past or scheduled operations/procedures.
- vaccination: Immunizations received or planned.
- other: Medically relevant facts that fit nowhere else.`;

const CLARITY_RUBRIC = `CLARITY SCORE RUBRIC (0.0–1.0) — score EVERY memory and medication:
Clarity measures how COMPLETELY SPECIFIED the fact is, NOT how confident you are that it happened.

What RAISES clarity for a MEDICATION (in order of importance):
+ Actual drug name, brand or generic ("Coartem", "artemether-lumefantrine") — REQUIRED to exceed 0.5
+ Dosage/strength per unit ("20/120mg", "1 tablet", "500mg")
+ Frequency ("twice daily", "every 8 hours")
+ Duration or quantity ("for 3 days", "5 doses left")
+ Source/context (prescribed by doctor vs bought over the counter)

What RAISES clarity for a DIAGNOSIS:
+ Named condition ("malaria", "typhoid")  — REQUIRED to exceed 0.5
+ Who established it (doctor diagnosed, positive lab/test result, self-suspected)
+ When it happened (today, last week)

ANCHOR EXAMPLES — calibrate against these:
* "he gave me a maleria medicine said i should take it 2 times a day"
  → medication clarity 0.35 — frequency known but THE DRUG NAME IS MISSING. Do NOT guess the drug.
* "my doctor told me i have malaria"
  → diagnosis clarity 0.85 — condition + credible source both present.
* "i'm taking coartem, the 20/120 one, morning and night for 3 days"
  → medication clarity 0.95 — name, strength, frequency, duration all present.
* "i bought some drugs for the fever at the pharmacy"
  → medication clarity 0.15 — nothing specified. missing_details: ["drug name","strength","dosage schedule"].
* "my sugar level was 180 this morning"
  → vital (glucose 180 mg/dL) — numeric readings are inherently high-clarity.

HARD RULES:
- If a medication has NO identifiable drug name, its clarity_score MUST stay below 0.5 and drug_name should be the most literal description possible prefixed with "Unidentified " (e.g. "Unidentified antimalarial tablet").
- NEVER invent drug names, strengths, dates, or test values that the patient did not say.
- A fact mentioned earlier in the transcript but only now clarified should be extracted NOW with its new, higher score.`;

const SEVERITY_RUBRIC = `SEVERITY RUBRIC — weigh each fact's clinical seriousness:

severe (life-threatening / urgent):
- Emergency red flags: chest pain radiating to arm/jaw, breathlessness at rest, fainting or unconsciousness, seizure, one-sided weakness or slurred speech, severe uncontrolled bleeding, stiff neck WITH fever AND rash, suicidal statements.
- Any condition explicitly described as an emergency, ICU admission, major surgery, or symptoms rapidly worsening.

moderate (needs active management):
- Clinician-diagnosed acute infections requiring treatment (e.g. malaria diagnosed by a doctor, typhoid, pneumonia).
- Chronic conditions when symptomatic/flaring (asthma attack, hypertensive headache, glucose excursions with symptoms).
- Symptoms disrupting daily activities (cannot work, cannot walk, vomiting everything, fever > 3 days).

mild (self-limiting / low impact):
- Minor transient discomfort: occasional headache, mild catarrh, tiredness after exertion, mild stomach upset — no functional impairment.

none (neutral context):
- Vaccinations done, family history, stable chronic condition check-ins ("my BP has been fine"), lifestyle notes without symptoms, completed treatments with resolution.

unknown:
- Genuinely not enough information to weigh (rare — make your best assessment otherwise).

ESCALATION RULES:
- Multiple red flags together → escalate one level above the single worst flag.
- Pregnancy + fever/bleeding/severe headache → at least severe.
- Infant/elderly patient context with fever/dehydration → escalate one level.`;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT:
- Respond with ONE raw JSON object matching the requested schema. No markdown fences, no code blocks, no commentary before or after.
- memories: NEW health facts introduced by the patient (use prior turns ONLY as context for pronouns like "it"/"the medicine").
- medications: concrete medication regimens mentioned (even vague ones — report them with their true low clarity_score and missing_details).
- vitals: any numeric or descriptive vital reading stated.
- If the message contains no health information, return empty arrays for all three.`;

export function buildExtractionPrompt(turns: ExtractionTurn[]): string {
  const transcript = turns
    .map((t) => `${t.role === "user" ? "PATIENT" : t.role.toUpperCase()}: ${t.content}`)
    .join("\n");

  return `You are the clinical entity extractor for Mhistree, a personal health-record system. You read a slice of conversation between a patient and their AI health companion and output structured health facts.

Your extraction feeds a real medical record. Precision matters more than volume: extracting a half-known fact as if complete is WORSE than flagging it as incomplete.

${CATEGORY_DEFINITIONS}

${CLARITY_RUBRIC}

${SEVERITY_RUBRIC}

${OUTPUT_CONTRACT}

TRANSCRIPT (most recent last):
${transcript}`;
}
