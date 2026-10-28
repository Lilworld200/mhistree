import { z } from "zod";
import {
  sourceInput,
  contributionInput,
} from "@/features/health-records/schema";

export const careNoteCategories = {
  clinical: "Clinical observation",
  "medication-use": "Medication use",
  prescription: "Prescription / medication recommendation",
  ongoing: "Condition / ongoing issue",
  allergy: "Allergy",
  baseline: "Baseline health detail",
  symptom: "Symptom",
  activity: "Activity",
} as const;
export type CareNoteCategory = keyof typeof careNoteCategories;
export const careNoteCategory = z.enum(
  Object.keys(careNoteCategories) as [CareNoteCategory, ...CareNoteCategory[]],
);
const short = z.string().trim().max(200).default("");
const date = z.union([z.iso.date(), z.literal("")]).default("");
export const careNoteFields = z
  .object({
    title: short,
    content: z.string().trim().max(8000).default(""),
    name: short,
    dose: short,
    frequency: short,
    route: short,
    indication: z.string().trim().max(500).default(""),
    useStatus: z
      .enum(["", "taking", "stopped", "not-started", "unknown"])
      .default(""),
    actualStart: date,
    actualEnd: date,
    plannedStart: date,
    plannedEnd: date,
    certainty: z.enum(["suspected", "confirmed"]).default("suspected"),
    reaction: z.string().trim().max(500).default(""),
    severity: z.enum(["", "unknown", "mild", "moderate", "severe"]).default(""),
    value: short,
    unit: short,
    bodySite: short,
    eventDate: date,
    status: z
      .enum(["active", "resolved", "recurrent", "unknown"])
      .default("unknown"),
  })
  .strict();
export type CareNoteFields = z.infer<typeof careNoteFields>;
export const careNoteInput = z
  .object({
    requestKey: z.uuid(),
    patientPersonId: z.uuid(),
    destination: z.enum(["note", "record"]),
    category: careNoteCategory,
    fields: careNoteFields,
    timezone: sourceInput.shape.sourceTimezone.refine((v) => v !== "unknown"),
    reviewed: z.boolean().default(false),
  })
  .strict()
  .superRefine((d, ctx) => {
    const required = (field: keyof CareNoteFields, message: string) => {
      if (!d.fields[field])
        ctx.addIssue({ code: "custom", path: ["fields", field], message });
    };
    if (d.destination === "note") {
      required("content", "Write your private note.");
      return;
    }
    if (!d.reviewed)
      ctx.addIssue({
        code: "custom",
        path: ["reviewed"],
        message: "Review the patient record before saving.",
      });
    if (["medication-use", "prescription"].includes(d.category)) {
      for (const field of ["name", "dose", "frequency"] as const) {
        required(field, `Enter the medication ${field}.`);
        if (
          /\b(?:or|maybe|unsure|unknown|either|possibly)\b/i.test(
            d.fields[field],
          ) ||
          (field === "name" && /^para$/i.test(d.fields.name))
        )
          ctx.addIssue({
            code: "custom",
            path: ["fields", field],
            message: `Clarify the medication ${field} before saving.`,
          });
      }
      if (d.category === "medication-use") {
        required("useStatus", "Choose the actual reported medication use.");
        if (d.fields.actualEnd && d.fields.useStatus !== "stopped")
          ctx.addIssue({
            code: "custom",
            path: ["fields", "actualEnd"],
            message: "A stop date requires stopped use.",
          });
        if (
          d.fields.actualStart &&
          !["taking", "stopped"].includes(d.fields.useStatus)
        )
          ctx.addIssue({
            code: "custom",
            path: ["fields", "actualStart"],
            message: "A start date requires confirmed taking or stopped use.",
          });
      }
    } else if (
      ["ongoing", "allergy", "baseline", "symptom", "activity"].includes(
        d.category,
      )
    ) {
      required("name", "Enter the health detail.");
      if (d.category === "baseline")
        required("value", "Enter the usual value or description.");
    } else required("content", "Describe the clinical observation.");
    for (const [start, end] of [
      ["actualStart", "actualEnd"],
      ["plannedStart", "plannedEnd"],
    ] as const)
      if (d.fields[start] && d.fields[end] && d.fields[end] < d.fields[start])
        ctx.addIssue({
          code: "custom",
          path: ["fields", end],
          message: "The end date cannot precede the start date.",
        });
  });
export type CareNoteInput = z.infer<typeof careNoteInput>;

/** Faithful structured practitioner input, without a model or inferred use/date. */
export function careNoteBody(
  d: Pick<CareNoteInput, "destination" | "category" | "fields">,
): z.infer<typeof contributionInput.shape.body> {
  const f = d.fields;
  if (d.destination === "note")
    return {
      text: [f.title, f.content].filter(Boolean).join("\n\n"),
      bodySite: null,
      contextLinks: [],
    };
  const lines: string[] = [];
  if (["medication-use", "prescription"].includes(d.category)) {
    lines.push(
      `${d.category === "prescription" ? "Prescription / recommendation" : "Medication use"}: ${f.name}.`,
      `Dose: ${f.dose}. Frequency: ${f.frequency}.${f.route ? ` Route: ${f.route}.` : ""}`,
    );
    if (f.indication) lines.push(`Reason for medication: ${f.indication}`);
    if (d.category === "medication-use")
      lines.push(
        `Actual reported use: ${f.useStatus}.${f.actualStart ? ` Started: ${f.actualStart}.` : ""}${f.actualEnd ? ` Stopped: ${f.actualEnd}.` : ""}`,
      );
    else if (f.plannedStart || f.plannedEnd)
      lines.push(
        `Prescribed course:${f.plannedStart ? ` from ${f.plannedStart}` : ""}${f.plannedEnd ? ` until ${f.plannedEnd}` : ""}. Actual use is not established by this prescription.`,
      );
  } else if (["ongoing", "allergy"].includes(d.category))
    lines.push(
      `${f.certainty === "suspected" ? "Suspected" : "Confirmed"} ${d.category === "allergy" ? "allergy" : "condition / ongoing issue"}: ${f.name}.`,
    );
  else if (d.category === "baseline")
    lines.push(
      `Baseline: ${f.name} — ${f.value}${f.unit ? ` ${f.unit}` : ""}.`,
    );
  else if (f.name) lines.push(`${careNoteCategories[d.category]}: ${f.name}.`);
  if (d.category === "allergy") {
    if (f.reaction) lines.push(`Reaction: ${f.reaction}.`);
    if (f.severity) lines.push(`Severity: ${f.severity}.`);
  }
  if (f.bodySite && ["symptom", "clinical", "ongoing"].includes(d.category))
    lines.push(`Body site: ${f.bodySite}.`);
  if (f.content) lines.push(f.content);
  if (d.category !== "medication-use")
    lines.push(
      `Recorded state: ${{ active: "active / current", resolved: "resolved", recurrent: "recurrent", unknown: "not established" }[f.status]}.`,
    );
  const medication =
    d.category === "medication-use"
      ? {
          useStatus: f.useStatus as
            "taking" | "stopped" | "not-started" | "unknown",
          plannedStart: null,
          plannedEnd: null,
          actualStart: f.actualStart || null,
          actualEnd: f.actualEnd || null,
        }
      : undefined;
  return {
    text: lines.join("\n"),
    bodySite: f.bodySite || null,
    contextLinks: [],
    careDetails: {
      name: f.name || undefined,
      ...(["prescription", "medication-use"].includes(d.category)
        ? {
            dose: f.dose,
            frequency: f.frequency,
            route: f.route || undefined,
            indication: f.indication || undefined,
          }
        : {}),
      ...(["allergy", "ongoing"].includes(d.category)
        ? { certainty: f.certainty }
        : {}),
      ...(d.category === "allergy"
        ? {
            reaction: f.reaction || undefined,
            severity: f.severity || undefined,
          }
        : {}),
      ...(d.category === "baseline"
        ? { value: f.value, unit: f.unit || undefined }
        : {}),
      ...(d.category === "prescription"
        ? {
            plannedStart: f.plannedStart || undefined,
            plannedEnd: f.plannedEnd || undefined,
          }
        : {}),
    },
    ...(medication ? { medication } : {}),
  };
}
