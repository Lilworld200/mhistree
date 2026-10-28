import { z } from "zod";
export const category = z.enum([
  "symptom",
  "activity",
  "medication-use",
  "allergy",
  "baseline",
  "ongoing",
  "document",
  "clinical",
  "prescription",
  "result",
]);
export const visibility = z.enum(["finalized", "draft", "private"]);
export const eventTime = z
  .discriminatedUnion("precision", [
    z
      .object({
        precision: z.literal("exact"),
        at: z.iso.datetime({ offset: true }),
      })
      .strict(),
    z
      .object({
        precision: z.literal("approximate"),
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
        originalPhrase: z.string().min(1),
      })
      .strict(),
    z
      .object({
        precision: z.literal("range"),
        from: z.iso.datetime({ offset: true }),
        to: z.iso.datetime({ offset: true }),
      })
      .strict(),
    z
      .object({
        precision: z.literal("unknown"),
        originalPhrase: z.string().optional(),
      })
      .strict(),
  ])
  .refine(
    (v) => !("from" in v) || new Date(v.from) <= new Date(v.to),
    "Invalid time interval",
  );
export const sourceInput = z
  .object({
    patientPersonId: z.uuid(),
    category,
    visibility: visibility.default("finalized"),
    sourceTimezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return v === "unknown";
      }
    }),
    content: z.string().min(1).max(100000),
    clientKey: z.uuid(),
    uploaded: z.boolean().default(false),
    messageId: z.uuid().optional(),
    parentSourceId: z.uuid().optional(),
  })
  .strict();
export const contributionInput = z
  .object({
    sourceId: z.uuid(),
    sourceVersion: z.number().int().positive(),
    sourceItemId: z.string().min(1).max(100),
    operationKey: z.uuid(),
    body: z
      .object({
        text: z.string().min(1).max(10000),
        reportStyle: z.literal("reported-predicate").optional(),
        bodySite: z.string().nullable().default(null),
        contextLinks: z.array(z.uuid()).default([]),
        episodeUpdate: z
          .object({
            eventId: z.uuid(),
            expectedVersion: z.number().int().positive(),
          })
          .strict()
          .optional(),
        medication: z
          .object({
            useStatus: z.enum(["taking", "stopped", "not-started", "unknown"]),
            plannedStart: z.iso.date().nullable(),
            plannedEnd: z.iso.date().nullable(),
            actualStart: z.iso.date().nullable(),
            actualEnd: z.iso.date().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    occurredAt: eventTime,
    status: z.enum(["active", "resolved", "recurrent", "unknown"]),
    sourceSpans: z.array(z.string().max(500)).min(1).max(100),
    correction: z
      .object({
        logicalId: z.uuid(),
        expectedVersion: z.number().int().positive(),
      })
      .strict()
      .optional(),
  })
  .strict();
