export type NarrativeBody = {
  text: string;
  reportStyle?: "reported-predicate";
};

/** The stored subject is the record's patient, not a replaceable name inside prose. */
export function recordNarrative(
  record: {
    body: NarrativeBody;
    source_status: string;
    source_spans?: string[];
  },
  audience: "patient" | "care-team" = "care-team",
) {
  if (record.source_status !== "patient-reported") return record.body.text;
  const subject = audience === "patient" ? "You" : "The patient";
  if (record.body.reportStyle === "reported-predicate") {
    const pronoun = audience === "patient" ? "you" : "they";
    return `${subject} reported that ${pronoun} ${record.body.text}`;
  }
  // Older keyword extractions have no safe grammatical predicate. Quote the
  // attributed span rather than inventing a richer report or replacing pronouns.
  const quote = record.source_spans?.join("; ");
  const shortLabel = record.body.text.trim().split(/\s+/).length <= 3;
  return `${subject} reported: ${quote && shortLabel ? `“${quote}”` : record.body.text}`;
}
