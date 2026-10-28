import { it, expect } from "vitest";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { aiGateway } from "@/lib/ai/gateway";
import {
  preparePractitionerReview,
  confirmPractitionerReview,
} from "@/features/clinical-care/practitioner-chat";
import { proposalFields } from "@/features/clinical-care/practitioner-review-card";
import { healthState } from "@/features/health-records/current-state";

it.skipIf(process.env.MHISTREE_LIVE_PRACTITIONER_REVIEW !== "1")(
  "selected provider chats and prepares editable single and combined findings through reviewed publication",
  async () => {
    const env = parseEnv(await readFile(".env", "utf8"));
    for (const key of [
      "AI_PROVIDER",
      "AI_NVIDIA_MODEL",
      "NVIDIA_API_KEY",
      "AI_OPENROUTER_MODEL",
      "OPENROUTER_API_KEY",
      "GROQ_API_KEY",
    ])
      if (!process.env[key] && env[key]) process.env[key] = env[key];
    const gateway = aiGateway();
    const db = await testDatabase();
    const observations: unknown[] = [];
    try {
      for (const [question, categories] of [
        ["Hello. Can you help me review this patient's care?", []],
        [
          "I confirmed hypertension. Prepare this condition for review.",
          ["ongoing"],
        ],
        [
          "I prescribe amlodipine. Prepare it for review; I will complete the dose and frequency in the card.",
          ["prescription"],
        ],
        [
          "I confirmed hypertension. I prescribe amlodipine 5 mg once daily. Prepare both findings for review.",
          ["ongoing", "prescription"],
        ],
      ] as const) {
        const doctor = await staffFixture(db.pool),
          patient = await staffFixture(db.pool);
        const connectionId = (
          await initiateDirectConnection(db.pool, doctor.session, {
            patientPersonId: patient.personId,
            requestKey: randomUUID(),
            method: "in-person",
            categories: [
              "clinical",
              "ongoing",
              "prescription",
              "medication-use",
            ],
            exclusions: [],
            evidence: "Synthetic identity and scope confirmed in person.",
          })
        ).id;
        const run = await practitionerAssistance(
          db.pool,
          doctor.session,
          {
            connectionId,
            question,
            purpose: "question",
            conversation: true,
            includeOwnNotes: false,
          },
          {
            generate: async (...args) => {
              const raw = await gateway.generate(...args);
              observations.push({ question, raw });
              return raw;
            },
          },
        );
        expect(run.text.length).toBeGreaterThan(0);
        expect(run.proposals.map((p) => p.category).sort()).toEqual(
          [...categories].sort(),
        );
        expect(
          (await healthState(db.pool, patient.session)).items,
        ).toHaveLength(0);
        if (!categories.length) continue;
        const context = { kind: "direct" as const, connectionId };
        const review = await preparePractitionerReview(
          db.pool,
          doctor.session,
          context,
          {
            runId: run.id,
            destination: "record",
            timezone: "Africa/Lagos",
            items: run.proposals.map((p) => ({
              id: p.id,
              fields: {
                ...proposalFields(p),
                ...(p.category === "prescription"
                  ? { dose: "5 mg", frequency: "once daily" }
                  : {}),
              },
            })),
          },
        );
        expect(review.text).toBeTruthy();
        await confirmPractitionerReview(db.pool, doctor.session, context, {
          reviewId: review.id,
          reviewed: true,
        });
        const health = await healthState(db.pool, patient.session);
        expect(health.items.length + health.prescriptions.length).toBe(
          categories.length,
        );
      }
    } finally {
      await mkdir(".local/practitioner-review", { recursive: true });
      await writeFile(
        ".local/practitioner-review/synthetic-provider.json",
        JSON.stringify({ model: gateway.modelName, observations }, null, 2),
      );
      await db.stop();
    }
  },
  240000,
);
