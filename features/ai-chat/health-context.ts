import "server-only";
import type { Pool } from "pg";
import { withAccess } from "@/features/access/server";
import { recordNarrative } from "@/features/health-records/narrative";
import {
  dialogueSchema,
  confirmationAnswer,
  type Dialogue,
  type PatientReply,
} from "./care-action-schema";
import type { ContextTurn } from "./context-plan";
import { replyText } from "./reply-text";

/** Safety context has its own budget, independent of keyword similarity. Not an interaction checker. */
export function medicationSafetyContext(
  pool: Pool,
  session: string,
  patientId: string,
) {
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const rows = (
      await a.tx.query(
        `with authorized as materialized (
      select e.id,e.category,e.status,e.body,e.source_status,e.source_spans,e.source_id,e.version,e.occurred_at,s.captured_at,s.source_timezone,
       count(*) over(partition by e.category) as category_count,
       row_number() over(partition by e.category order by e.recorded_at desc,e.id desc) as lane
      from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id join mhistree.sources s on s.id=e.source_id
      where mhistree.canonical_person(e.patient_person_id)=mhistree.canonical_person($1) and e.visibility='finalized'
       and e.category in ('medication-use','prescription','allergy','ongoing','baseline'))
      select * from authorized where lane<=4 order by lane,category,id limit 21`,
        [patientId],
      )
    ).rows;
    const items = [];
    let size = 0;
    for (const row of rows.slice(0, 20)) {
      const item = {
        id: row.id,
        sourceId: row.source_id,
        category: row.category,
        status: row.status,
        text: recordNarrative(row).slice(0, 1000),
        version: row.version,
        eventTime: row.occurred_at,
        capturedAt: row.captured_at.toISOString(),
        timezone: row.source_timezone,
      };
      size += JSON.stringify(item).length;
      if (size > 6000) break;
      items.push(item);
    }
    return {
      items,
      bounded:
        rows.some((r) => Number(r.category_count) > 4) ||
        rows.length >= 20 ||
        items.length < rows.length,
      incomplete: true as const,
    };
  });
}

export function replyDialogue(reply: PatientReply, health: boolean): Dialogue {
  const parsed = dialogueSchema.safeParse(reply.dialogue);
  if (parsed.success) return parsed.data;
  return {
    topic: health ? "health" : "everyday",
    decision: health ? "clarification" : "general_information",
    question: { kind: "none", subject: "" },
  };
}

export function contactOfferAccepted(history: ContextTurn[], current: string) {
  const last = [...history].reverse().find((m) => m.role === "assistant");
  return (
    confirmationAnswer(current) === "yes" &&
    last?.dialogue?.question?.kind === "offer_contact"
  );
}

/** Only literal patient evidence is compiled into outbound statements. AI prose isn't patient action. */
export function groundedContactDraft(
  history: ContextTurn[],
  current: string,
  requestedQuotes: string[] = [],
) {
  const patient = history
    .filter((m) => m.role === "patient" || m.role === "user")
    .map((m) => m.content);
  const exact = requestedQuotes
    .filter(
      (q) =>
        patient.some((p) => p.includes(q)) &&
        q.length > 3 &&
        !confirmationAnswer(q),
    )
    .slice(0, 4);
  const useful = [
    ...new Set([
      ...exact,
      ...patient
        .filter(
          (p) =>
            !confirmationAnswer(p) &&
            /\b(throat|dry|pain|stomach|belly|medicine|medication|take|taking|drink|omeprazole|trimazole|tablet|symptom|doctor|practitioner)\b/i.test(
              p,
            ),
        )
        .slice(-3),
    ]),
  ].slice(0, 4);
  if (!useful.length && !confirmationAnswer(current)) useful.push(current);
  const pieces = useful.map((q) => `I said: “${q}”`);
  for (let i = 1; i < history.length; i++) {
    const answer = history[i],
      question = history[i - 1];
    if (
      (answer.role === "patient" || answer.role === "user") &&
      confirmationAnswer(answer.content) === "yes" &&
      question.role === "assistant" &&
      question.dialogue?.question?.kind === "symptom"
    )
      pieces.push(`When asked “${question.content}”, I answered yes.`);
  }
  const previous = [...history].reverse().find((m) => m.role === "assistant");
  if (
    confirmationAnswer(current) === "yes" &&
    previous?.dialogue?.question?.kind === "symptom"
  )
    pieces.push(`When asked “${previous.content}”, I answered yes.`);
  const draft = `Hello, I'd like your advice.\n\n${pieces.join("\n\n")}\n\nCould you advise on my question and whether I need an assessment?`;
  // A long source is not silently shortened into a different claim.
  const filtered = replyText(draft);
  return filtered && filtered.length <= 10000
    ? filtered
    : "Hello, I'd like advice about a health concern and a medicine I am considering. Could we discuss whether it is appropriate for me?";
}

export function uncertainMedicineName(text: string) {
  return (
    /\b(?:co[ -]*trimazole|parastamol)\b/i.test(text.replace(/[‑–—]/g, "-")) ||
    /\b(?:unsure|not sure)\b.{0,35}\b(?:medicine name|drug name|spelling)\b/i.test(
      text,
    )
  );
}

/** Retain observed spelling uncertainty across short follow-ups; patient corrections supersede it. */
export function unresolvedMedicineName(
  history: ContextTurn[],
  current: string,
) {
  const turns = [
    ...history
      .filter((m) => m.role === "patient" || m.role === "user")
      .slice(-6)
      .map((m) => m.content),
    current,
  ];
  let unresolved = false;
  for (const text of turns) {
    const names = text
      .replace(/[‑–—]/g, "-")
      .match(
        /\b(?:co[ -]*trimazole|parastamol|co[ -]*trimoxazole|clotrimazole|paracetamol)\b/gi,
      );
    if (names?.length) unresolved = uncertainMedicineName(names.at(-1)!);
  }
  return unresolved;
}

export function conversationalHealthText(
  text: string,
  personalMedication: boolean,
  hasHistory: boolean,
  urgent: boolean,
  currentQuestion = "",
  recalledDryThroat = false,
  unresolvedName = false,
) {
  const cleaned = replyText(text)
    .replace(/^\s*I(?:['’]m| am) not a doctor\s*[,;.]?\s*(?:but\s*)?/i, "")
    .trim();
  if (
    !urgent &&
    (uncertainMedicineName(currentQuestion) ||
      (unresolvedName &&
        /\b(?:antibiotic|co[ -]*trimoxazole|clotrimazole)\b/i.test(
          cleaned.replace(/[‑–—]/g, "-"),
        )))
  )
    return `${recalledDryThroat ? "You mentioned a dry throat earlier. " : ""}Before discussing a new medicine, could you confirm its exact name from the packet or prescription?`;
  if (
    !urgent &&
    personalMedication &&
    /\b(?:usually|generally) (?:fine|safe)|\bsafe for you\b|\bfine if you\b/i.test(
      cleaned,
    )
  ) {
    return hasHistory
      ? "Let's work out what you're considering it for before adding a new medicine. Is this related to what you mentioned earlier, or something new?"
      : "Let's work out what you're considering it for before adding a new medicine. What symptoms are you hoping it will help with?";
  }
  return cleaned;
}

/** Preparation is a separate patient decision; a model suggestion alone grants no action. */
export function requestedCareAction(
  reply: PatientReply,
  current: string,
  acceptedOffer: boolean,
) {
  if (reply.action?.kind === "appointment") return reply.action;
  const explicit =
    /\b(contact|message|send|ask|speak|talk)\b.{0,60}\b(doctor|nurse|practitioner|care team|dr|mr)\b/i.test(
      current,
    );
  return acceptedOffer || explicit
    ? (reply.action ?? {
        kind: "message" as const,
        connectionId: null,
        practitionerId: null,
        draft: "",
      })
    : null;
}
