import { currentMedicationProjection } from "@/features/health-records/medication-projection";
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
       and e.category in ('medication-use','prescription','allergy','ongoing','baseline') and ${currentMedicationProjection})
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
  const turns = precedingCareTurns(history, current);
  const last = turns.at(-1);
  const offer = last?.content ?? "";
  const explicitOffer =
    /\b(?:would you like|would it help|do you want|shall i|should i|can i|could i|may i|want me to|want help)\b/i.test(
      offer,
    ) &&
    (/\b(?:ask(?:ing)?|contact(?:ing)?|messag(?:e|ing)|speak(?:ing)?|talk(?:ing)?|send(?:ing)?)\b.{0,80}\b(?:doctors?|practitioners?|nurses?|care team|dr)\b/i.test(
      offer,
    ) ||
      /\b(?:prepare|draft|write|put together)\b.{0,60}\b(?:message|question)\b/i.test(
        offer,
      ));
  return (
    preparationAnswer(current) &&
    last?.role === "assistant" &&
    explicitOffer &&
    (offer.match(/\?/g)?.length ?? 0) === 1 &&
    !/\b(?:and|also)\b.{0,40}\b(?:do you|are you|is it|have you|would you|should i)\b/i.test(
      offer,
    )
  );
}

function precedingCareTurns(history: ContextTurn[], current: string) {
  const last = history.at(-1);
  return last &&
    ["patient", "user"].includes(last.role) &&
    last.content === current
    ? history.slice(0, -1)
    : history;
}

/** Preparation consent is deliberately separate from the exact reviewed Send answer. */
function preparationAnswer(text: string) {
  return (
    confirmationAnswer(text) === "yes" ||
    /^(?:okay|ok|yes|sure)[, ]+(?:please )?(?:do so|do that|do it)[.! ]*$/i.test(
      text.trim(),
    ) ||
    /^(?:please do|please do so)[.! ]*$/i.test(text.trim())
  );
}

export function explicitCareRequest(text: string) {
  return (
    /\b(contact|message|send|ask|speak|talk)\b.{0,60}\b(doctor|nurse|practitioner|care team|dr|mr)\b/i.test(
      text,
    ) &&
    !/\b(?:don't|do not|not to|no need to)\b.{0,40}\b(?:contact|message|send|ask|speak|talk)\b/i.test(
      text.replace(/[’‘]/g, "'"),
    )
  );
}

export function careDraftRecovery(text: string) {
  const value = text.replace(/[’‘]/g, "'");
  return /\b(?:where|show|see|find|missing|review|resend|reopen|bring back)\b.{0,65}\b(?:draft|message|card)\b|\b(?:draft|message|card)\b.{0,45}\b(?:missing|not showing|not visible)\b|\bresend (?:it|that)\b/i.test(
    value,
  );
}

export function previouslyRequestedCare(
  history: ContextTurn[],
  current: string,
) {
  const turns = precedingCareTurns(history, current).slice(-20);
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (!["patient", "user"].includes(turn.role)) continue;
    if (
      confirmationAnswer(turn.content) === "no" ||
      /\b(?:change (?:the )?(?:subject|topic)|something unrelated|let's talk about)\b/i.test(
        turn.content,
      )
    )
      return false;
    if (
      explicitCareRequest(turn.content) ||
      contactOfferAccepted(turns.slice(0, i), turn.content)
    )
      return true;
  }
  return false;
}

/** Model prose cannot establish draft creation, delivery, or a recipient's attention. */
export function claimsCareOperation(text: string) {
  if (
    !/\b(?:draft|message|card|doctor|practitioner|nurse|care team|appointment|booking)\b/i.test(
      text,
    )
  )
    return false;
  return /\b(?:i(?:['’]ve| have)?|we(?:['’]ve| have)?)\s+(?:(?:already|just)\s+)?(?:prepared|drafted|created|put together|sent|contacted|notified|resent|forwarded|booked|scheduled)\b|\b(?:the|your|a)\s+(?:message\s+)?draft\s+(?:is|was|should|will)\b|\bhere(?:['’]s| is)\s+(?:a|the|your)\s+(?:message|draft)\b|\b(?:resending|sending)\b.{0,60}\b(?:draft|message|doctor|practitioner|card)\b|\byou (?:should|will|can|'ll)\s*see\s+(?:a|the|your)\s+(?:review\s+)?(?:card|draft)\b|\b(?:message|request)\b.{0,35}\b(?:has been|was|is)\s+(?:sent|delivered|forwarded|saved)\b/i.test(
    text,
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
        !preparationAnswer(q) &&
        !careDraftRecovery(q),
    )
    .slice(0, 4);
  const useful = [
    ...new Set([
      ...exact,
      ...patient
        .filter(
          (p) =>
            !confirmationAnswer(p) &&
            !preparationAnswer(p) &&
            !careDraftRecovery(p) &&
            /\b(throat|dry|pain|stomach|belly|taste|bitter|fever|malaria|medicine|medication|take|taking|drink|omeprazole|trimazole|tablet|symptom|doctor|practitioner)\b/i.test(
              p,
            ),
        )
        .slice(-3),
    ]),
  ].slice(0, 4);
  if (
    !useful.length &&
    !confirmationAnswer(current) &&
    !preparationAnswer(current) &&
    !careDraftRecovery(current)
  )
    useful.push(current);
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
  if (
    reply.action?.kind === "appointment" &&
    /\b(?:appointment|book|booking|schedule|visit)\b/i.test(current)
  )
    return reply.action;
  const explicit = explicitCareRequest(current);
  return acceptedOffer || explicit
    ? reply.action?.kind === "message"
      ? reply.action
      : {
          kind: "message" as const,
          connectionId: null,
          practitionerId: null,
          draft: "",
        }
    : null;
}
