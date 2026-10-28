import { z } from "zod";
import { contributionInput } from "@/features/health-records/schema";

export const proposalCategory = z.enum([
  "clinical",
  "symptom",
  "activity",
  "medication-use",
  "prescription",
  "allergy",
  "ongoing",
  "baseline",
]);
export const practitionerProposal = z
  .object({
    category: proposalCategory,
    body: contributionInput.shape.body,
    occurredAt: contributionInput.shape.occurredAt,
    status: contributionInput.shape.status,
    sourceSpans: z.array(z.string().min(1).max(500)).min(1).max(12),
    missingDetails: z.array(z.string().min(1).max(300)).max(12),
    medicationDetails: z
      .object({
        name: z.string().min(1).max(200).nullable(),
        dose: z.string().min(1).max(200).nullable(),
        frequency: z.string().min(1).max(200).nullable(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const storedPractitionerProposal = practitionerProposal.extend({
  id: z.uuid(),
});
export type PractitionerProposal = z.infer<typeof storedPractitionerProposal>;
export type PractitionerReply = {
  id: string;
  text: string;
  evidenceIds: string[];
  limitations: string[];
  proposals?: PractitionerProposal[];
};
export const proposalDestinations: Record<
  z.infer<typeof proposalCategory>,
  string
> = {
  clinical: "timeline",
  symptom: "timeline",
  activity: "timeline",
  "medication-use": "timeline & medications",
  prescription: "timeline & prescriptions",
  allergy: "timeline & allergies",
  ongoing: "timeline & ongoing issues",
  baseline: "timeline & baseline",
};

/** Medication identification/dose/frequency must be supplied, never filled by AI. */
export function proposalGaps(proposal: z.infer<typeof practitionerProposal>) {
  const gaps = [...proposal.missingDetails];
  if (["medication-use", "prescription"].includes(proposal.category)) {
    for (const field of ["name", "dose", "frequency"] as const)
      if (
        !proposal.medicationDetails?.[field] ||
        (field === "name" &&
          /^para$/i.test(proposal.medicationDetails[field].trim())) ||
        /\b(or|maybe|unsure|unknown|either|possibly)\b/i.test(
          proposal.medicationDetails[field],
        )
      )
        gaps.push(`Clarify medication ${field}.`);
    if (proposal.category === "medication-use" && !proposal.body.medication)
      gaps.push("Clarify actual medication use status.");
  }
  return [...new Set(gaps)];
}
