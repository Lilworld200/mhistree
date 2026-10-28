import { z } from "zod";

export const dialogueSchema = z
  .object({
    topic: z.enum(["health", "everyday"]),
    decision: z.enum([
      "general_information",
      "clarification",
      "clinical_review",
      "urgent",
    ]),
    question: z
      .object({
        kind: z.enum(["none", "symptom", "offer_contact", "other"]),
        subject: z.string().max(300),
      })
      .strict(),
  })
  .strict();
export type Dialogue = z.infer<typeof dialogueSchema>;

// Kept separate from conversational text, extraction sources, summaries and speech.
export const patientReplySchema = z
  .object({
    text: z.string().min(1).max(20000),
    dialogue: dialogueSchema,
    sourceQuotes: z.array(z.string().min(1).max(1500)).max(6),
    action: z
      .object({
        kind: z.enum(["message", "appointment"]),
        connectionId: z.string().nullable(),
        practitionerId: z.string().nullable(),
        draft: z.string().max(10000),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PatientReply = Omit<
  z.infer<typeof patientReplySchema>,
  "dialogue" | "sourceQuotes"
> & { dialogue?: Dialogue; sourceQuotes?: string[] };
export const patientReplyFormat = {
  name: "patient_reply",
  schema: z.toJSONSchema(patientReplySchema),
};

export const selectedRecipient = z
  .object({
    connectionId: z.uuid(),
    practitionerId: z.uuid(),
    connectionRevision: z.number().int().positive(),
  })
  .strict();
export type SelectedRecipient = z.infer<typeof selectedRecipient>;
export const careDraft = z
  .object({
    content: z.string().max(10000),
    recipients: z.array(selectedRecipient).max(100).optional(),
    connectionId: z.uuid().nullable(),
    practitionerId: z.uuid().nullable(),
    connectionRevision: z.number().int().positive().nullable(),
    slot: z
      .object({
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        timezone: z.string().min(1).max(100),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type CareDraft = z.infer<typeof careDraft>;
export type CareProposal = {
  id: string;
  kind: "message" | "appointment";
  version: number;
  state: "draft" | "dismissed" | "completed" | "partial" | "failed" | "sending";
  payload: CareDraft;
  result_id: string | null;
  deliveries?: {
    connectionId: string;
    state: "pending" | "stored" | "failed";
    resultId: string | null;
    errorCode: string | null;
  }[];
  confirmation?: { id: string; question: string; version: number } | null;
};
export type CareRecipient = {
  connectionId: string;
  practitionerId: string;
  revision: number;
  name: string;
  kind: "direct" | "organization";
};
export type CareOptions = {
  status: "available" | "unavailable";
  recipients: CareRecipient[];
  bounded: boolean;
  slots: {
    id: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    practitionerId: string;
  }[];
};

/** Ground intent in submitted patient wording, never in a model's recipient guess. */
export function intendedCareRecipient(
  text: string,
  recipients: CareRecipient[],
) {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .replace(/\b(?:dr|doctor|mr|mrs|ms|prof)\b\.?\s*/g, "")
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(" ") ?? "";
  // Only a standalone exact name (e.g. the answer to "which practitioner?")
  // is preselected. A model's interpretation of a longer request is not authority.
  const exact = recipients.filter((r) => normalize(r.name) === normalize(text));
  return exact.length === 1 ? exact[0] : undefined;
}

/** Initial shared text is a literal patient question, not an inferred regimen/history. */
export function reviewedCareDraft(patientText: string) {
  const prefix = "I'd like advice about this:\n\n";
  return patientText.length + prefix.length <= 10000
    ? prefix + patientText
    : "";
}

export function chooseCareRecipients(
  text: string,
  recipients: CareRecipient[],
): SelectedRecipient[] {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(?:dr|doctor|mr|mrs|ms|prof)\b\.?/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const named = recipients.filter((r) =>
    ` ${normalize(text)} `.includes(` ${normalize(r.name)} `),
  );
  if (
    named.some(
      (r) =>
        recipients.filter(
          (other) => normalize(other.name) === normalize(r.name),
        ).length > 1,
    )
  )
    return [];
  if (named.length)
    return named.map((r) => ({
      connectionId: r.connectionId,
      practitionerId: r.practitionerId,
      connectionRevision: r.revision,
    }));
  if (/\b(?:dr|mr|mrs|ms|prof)\.?\s+\p{L}/iu.test(text)) return [];
  // Server query order: recent outgoing contact, active grant, display name, stable ID.
  return recipients.slice(0, 1).map((r) => ({
    connectionId: r.connectionId,
    practitionerId: r.practitionerId,
    connectionRevision: r.revision,
  }));
}

export function confirmationAnswer(text: string): "yes" | "no" | null {
  const value = text
    .trim()
    .toLowerCase()
    .replace(/[.!]+$/, "")
    .replace(/\s+/g, " ");
  if (
    [
      "yes",
      "yes please",
      "yes send it",
      "yes send",
      "okay",
      "ok",
      "sure",
      "proceed",
      "go ahead",
      "send",
      "send it",
      "please send",
      "absolutely",
      "sounds good",
    ].includes(value)
  )
    return "yes";
  if (
    [
      "no",
      "no thanks",
      "no thank you",
      "cancel",
      "don't send",
      "do not send",
      "stop",
      "not now",
      "never mind",
      "nevermind",
    ].includes(value)
  )
    return "no";
  return null;
}

export const careActionPolicy = `Return strict JSON: text, dialogue, sourceQuotes, action. dialogue is private workflow metadata: topic health/everyday; decision general_information/clarification/clinical_review/urgent; question.kind none/symptom/offer_contact/other and a brief subject. Label question.kind accurately: asking if a symptom continues is symptom; asking whether the person wants practitioner contact is offer_contact. Never interpret a yes to symptoms as permission to send.
Use warm natural conversation, one useful question at a time. Avoid routine "I'm not a doctor" disclaimers or unsupported assurances such as "usually fine if you have no other medicines". Medication suitability is personal clinical confirmation, distinct from explaining general information. Clarify uncertain drug names without guessing; never prescribe, add a medicine, stop prescribed treatment or infer actual use from considering it. Ask why they are considering a medicine and use dated relevant history without assuming an old symptom persists. Do not automatically defer every general health question or ordinary discomfort. When personal medication guidance is appropriate and relevant symptoms have been discussed, offer connected practitioner contact naturally. Do not offer it repeatedly after refusal. Urgent real-world help takes priority over inbox contact.
sourceQuotes contains up to six SHORT EXACT quotes from relevant current-episode PATIENT messages to prepare a grounded outbound question; never quote assistant assertions, private notes or professional record excerpts. A yes may be interpreted only alongside the immediately preceding single question. Do not invent a medication regimen, dose, diagnosis, duration or side effect. For accepted contact offers or explicit message requests, action.kind=message and draft is a concise proposed question. Otherwise action=null until the patient agrees to preparation. The server generates a nonblank editable source-grounded question and chooses current eligible defaults; it alone can execute reviewed sends. Multiple recipients can be selected in cards. Do not invent a preferred doctor. Unknown named recipients must not be substituted silently. An explicit appointment request can prepare kind=appointment; dates and timezone are selected in its card, not guessed. Never claim contact, notification, booking, attention or clinical review without a saved operation result. Text briefly introduces the card rather than repeating its full draft. IDs and workflow metadata never belong in text. A positive answer sends only after the server-owned exact-version Send question; otherwise it can only clarify or prepare.`;
