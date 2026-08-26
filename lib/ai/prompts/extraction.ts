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
+ Actual drug name, brand or generic ("Coartem", "artemether-lumefantrine") — an IDENTIFIABLE drug name ALONE always scores >= 0.6, even when dosage/frequency/duration are still missing. Never score a NAMED drug below the 0.5 storage threshold; put what is missing in missing_details instead.
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
* "am also suppose to take amoxicillin and white color vitamin c"
  → TWO separate medication items: amoxicillin clarity 0.65, vitamin c clarity 0.6 — each drug is named but the regimen is incomplete. missing_details for both: ["strength/dosage","frequency"]. Extract ONE item PER drug.
* "my sugar level was 180 this morning"
  → vital (glucose 180 mg/dL) — numeric readings are inherently high-clarity.

HARD RULES:
- If a medication has NO identifiable drug name, its clarity_score MUST stay below 0.5 and drug_name should be the most literal description possible prefixed with "Unidentified " (e.g. "Unidentified antimalarial tablet").
- Conversely, when a specific drug IS identifiable (generic name, resolvable brand, or correctable misspelling), its clarity_score MUST be at least 0.6 — do NOT withhold it for lacking dosage/frequency/duration.
- When the patient names MULTIPLE medications in one message ("amoxicillin and vitamin c", "paracetamol and ibuprofen"), emit one medication item PER drug — never merge them into a single entry or drop any of them.
- NEVER invent drug names, strengths, dates, or test values that the patient did not say.
- A fact mentioned earlier in the transcript but only now clarified should be extracted NOW with its new, higher score.`;

const DRUG_NAME_RESOLUTION = `DRUG NAME RESOLUTION (applies to every medication):
- Resolve brand names and common misspellings to the GENERIC (INN) drug name, keeping the original brand wording in clinical_payload.brand_name:
  Coartem → artemether-lumefantrine · Panadol/Tylenol → paracetamol · Advil/Nurofen/Brufen → ibuprofen · Voltaren → diclofenac · Naprosyn → naproxen · Amoxil → amoxicillin · Flagyl → metronidazole · Zinnat → cefuroxime · Augmentin → amoxicillin-clavulanate · Aspirin stays aspirin.
- Tolerate spelling errors ("panadole", "ibuprofin") and resolve them to the generic name.
- INDIRECT REFERENCES: when the patient refers to a drug indirectly ("my malaria medicine", "the antibiotics", "those tablets"), FIRST check the KNOWN MEDICATIONS ON FILE section below — if exactly one listed medication matches the description, use its exact drug_name and set clarity >= 0.6. Only fall back to "Unidentified <description>" when nothing on file or in the transcript matches. Do NOT invent.
- If the patient describes a class only ("an NSAID", "antimalarial tablets") and nothing on file matches, do NOT invent a specific drug: use "Unidentified <class>" as drug_name and keep clarity below 0.5.
- When a doctor prescribed it but no name surfaced yet, still report inferred_by "doctor" — trust scoring handles the rest.`;

const SOURCE_CREDIBILITY_RULES = `SOURCE CREDIBILITY (set for EVERY memory item):
- "clinician": a doctor, nurse, pharmacist, or clinic/hospital established it ("my doctor said", "at the hospital they told me").
- "test_result": confirmed by lab work, scan, or test ("blood test showed", "malaria test came out positive", "BP reading was 160/100 at the clinic").
- "self_reported": only the patient's own experience or suspicion ("i think i have", "i feel like").
- "unknown": genuinely not determinable from the transcript.
This field decides whether a fact is promoted to the CONFIRMED/DETERMINED tiers of the health profile. Be accurate — never generous.`;

const MEDICATION_LIFECYCLE_RULES = `MEDICATION LIFE-CYCLE (stopping, finishing, resuming):
- When the patient says they STOPPED a medication ("am no longer taking…", "i stopped the…"), FINISHED a course ("i have finished the drugs", "the course is complete"), or RESUMED one ("i started taking it again"), you MUST emit a medication item for that drug:
  * status: "discontinued" (stopped) | "completed" (finished course) | "active" (resumed)
  * status_change_reason: why it was stopped/finished (e.g. "malaria infection resolved")
  * status_change_by: "doctor" if a clinician confirmed or ordered it, "patient" if self-decided
  * Resolve the drug name exactly as usual — against the KNOWN MEDICATIONS ON FILE list first, then the transcript.
- Life-cycle changes are NEW information: emitting them NEVER violates the no-re-emission rule.
- ANCHOR EXAMPLE:
  PATIENT: "my doctor just confirmed that my malaria is gone but i still have typhoid so am no longer taking the malaria medicine but i am still taking the other ones"
  → medication item: { drug_name: from KNOWN MEDICATIONS ON FILE (e.g. "artemether-lumefantrine"), status: "discontinued", status_change_reason: "Malaria infection has resolved", status_change_by: "doctor", clarity >= 0.6 }
- If the drug cannot be resolved to ANY name (on-file or in-transcript), emit "Unidentified <description>" with low clarity per the HARD RULES — do not invent.`;

const CONDITION_STATUS_RULES = `CONDITION STATUS (for diagnosis / chronic_condition items):
- Set condition_status: "resolved" when the patient reports being CURED, CLEARED, RECOVERED, or a doctor confirmed the condition is GONE ("my doctor just confirmed that my malaria is gone", "the typhoid has cleared", "i no longer have asthma symptoms").
- Set condition_status: "active" when the patient currently HAS the condition (new diagnosis or ongoing).
- Omit the field when nothing about current status changed.
- A resolution statement is NEW information and must be extracted even though the condition itself is old.`;

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

const TRUST_SCORE_RUBRIC = `TRUST_SCORE & INFERRED_BY for MEDICATIONS (output both fields for every medication):

trust_score (0–100): How confident are we that this specific drug and regimen is what the patient SHOULD be taking?
+ 100: Doctor explicitly named the drug AND it is the correct prescription (e.g. "the doctor prescribed Amoxicillin 500mg twice daily")
+ 85: Doctor prescribed it but drug name not yet confirmed (we know it's a prescription from a doctor)
+ 70: Drug class strongly implied by description + prescriber context (e.g. "anti-inflammatory NSAID for 5 days twice daily with food")
+ 50: Drug mentioned without clear prescriber or full details
+ 30: Generic OTC purchase, no confirmation of appropriateness
+ 10: Vague mention with no source

inferred_by: Who determined this medication?
- "doctor"        → patient explicitly says a doctor/clinic/hospital prescribed/gave it
- "pharmacist"    → patient says the pharmacist recommended it without a doctor
- "self_reported" → patient bought it OTC on their own without professional advice
- "ai_inferred"   → we are inferring the drug class from symptoms/description; no clear human source stated`;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT:
- Respond with ONE raw JSON object matching the requested schema. No markdown fences, no code blocks, no commentary before or after.
- memories: health facts introduced by the PATIENT in the latest turn(s). Prior turns and ASSISTANT turns are context ONLY (to resolve pronouns like "it"/"the medicine") — never a source of facts on their own.
- ATOMICITY: exactly ONE fact per memory item — one condition, one symptom pattern, one life event, one allergy. When the patient introduces SEVERAL distinct facts at once, emit one SEPARATE item per fact. Multiple items are correct; bundled items are not.
- NO RECAPS: never emit summary/recap statements that bundle multiple things ("Patient is being treated for malaria and typhoid with amoxicillin and vitamin C"). Medications belong exclusively in the medications array, one item per drug — do NOT re-list them inside memories.
- Do NOT re-emit or lightly paraphrase a memory that is already stated earlier in the transcript or would obviously already be recorded. Only genuinely NEW patient information goes into memories.
- medications: concrete medication regimens mentioned (even vague ones — report them with their true low clarity_score and missing_details), ONE item PER drug. Re-emitting an already-known medication WITH newly clarified details (e.g. confirmed strength/frequency) is REQUIRED so the server can merge the update. Always include trust_score and inferred_by.
- vitals: any numeric or descriptive vital reading stated.
- If the message contains no health information, return empty arrays for all three.`;

export function buildExtractionPrompt(
  turns: ExtractionTurn[],
  knownMedications: string[] = [],
): string {
  const transcript = turns
    .map(
      (t) =>
        `${t.role === "user" ? "PATIENT" : t.role.toUpperCase()}: ${t.content}`,
    )
    .join("\n");

  const knownMedsSection =
    knownMedications.length > 0
      ? `KNOWN MEDICATIONS ON FILE (use these exact drug_name values when the patient refers to them directly or indirectly):
${knownMedications.map((m) => `- ${m}`).join("\n")}`
      : "KNOWN MEDICATIONS ON FILE: none recorded yet.";

  return `You are the clinical entity extractor for Mhistree, a personal health-record system. You read a slice of conversation between a patient and their AI health companion and output structured health facts.

Your extraction feeds a real medical record. Precision matters more than volume: extracting a half-known fact as if complete is WORSE than flagging it as incomplete.

${CATEGORY_DEFINITIONS}

${CLARITY_RUBRIC}

${DRUG_NAME_RESOLUTION}

${MEDICATION_LIFECYCLE_RULES}

${SOURCE_CREDIBILITY_RULES}

${CONDITION_STATUS_RULES}

${SEVERITY_RUBRIC}

${TRUST_SCORE_RUBRIC}

${OUTPUT_CONTRACT}

${knownMedsSection}

TRANSCRIPT (most recent last):
${transcript}`;
}
