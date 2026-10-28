import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { CompatibleGateway } from "@/lib/ai/compatible";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { savePractitionerProposal } from "@/features/clinical-care/ai-entry";
import { createConversation, sendMessage } from "@/features/ai-chat/server";
import { handoffSummary } from "@/features/ai-chat/memory";
import { healthState } from "@/features/health-records/current-state";
import { sendCareMessage, careMessages } from "@/features/messaging/server";

it.skipIf(process.env.MHISTREE_LIVE_CONNECTED_CARE !== "1")(
  "selected live provider preserves suspected findings and prepares a reviewed private-summary handoff on synthetic records",
  async () => {
    const env = { ...parseEnv(await readFile(".env", "utf8")), ...process.env };
    if (env.AI_PROVIDER !== "nvidia" && env.AI_PROVIDER !== "openrouter")
      throw new Error(
        "This opt-in fixture requires the explicitly selected compatible provider.",
      );
    const gateway = new CompatibleGateway(
      env[
        env.AI_PROVIDER === "nvidia" ? "NVIDIA_API_KEY" : "OPENROUTER_API_KEY"
      ]!,
      env.AI_PROVIDER,
      env[
        env.AI_PROVIDER === "nvidia" ? "AI_NVIDIA_MODEL" : "AI_OPENROUTER_MODEL"
      ]!,
    );
    const db = await testDatabase();
    try {
      const doctor = await staffFixture(db.pool),
        patient = await staffFixture(db.pool);
      await db.pool.query(
        "update mhistree.professionals set privileges=array_append(privileges,'messages.send') where account_id=$1",
        [doctor.accountId],
      );
      const connectionId = (
        await initiateDirectConnection(db.pool, doctor.session, {
          patientPersonId: patient.personId,
          requestKey: randomUUID(),
          method: "in-person",
          categories: ["allergy", "clinical"],
          exclusions: [],
          evidence:
            "Synthetic identity and explicit allergy scope confirmed in person.",
        })
      ).id;
      const context = { kind: "direct" as const, connectionId };
      const text =
        "I suspect a latex allergy. This is not confirmed. Please prepare a suspected allergy entry for my review.";
      const run = await practitionerAssistance(
        db.pool,
        doctor.session,
        {
          connectionId,
          question: text,
          purpose: "draft",
          includeOwnNotes: false,
          conversation: true,
        },
        gateway,
      );
      await mkdir(".local/care-connected", { recursive: true });
      await writeFile(
        ".local/care-connected/live-practitioner-observation.json",
        JSON.stringify(
          {
            model: gateway.modelName,
            usage: gateway.observedUsage,
            response: run,
          },
          null,
          2,
        ),
      );
      expect(run.proposals).toHaveLength(1);
      expect(run.proposals[0].category).toBe("allergy");
      expect(run.proposals[0].body.text).toMatch(
        /suspect|unconfirmed|not confirmed/i,
      );
      expect((await healthState(db.pool, patient.session)).items).toHaveLength(
        0,
      );
      await savePractitionerProposal(db.pool, doctor.session, context, {
        runId: run.id,
        itemId: run.proposals[0].id,
        destination: "record",
        reviewed: true,
        text: run.proposals[0].body.text,
      });
      const id = randomUUID();
      await createConversation(db.pool, patient.session, id);
      await sendMessage(db.pool, patient.session, {
        conversationId: id,
        requestKey: randomUUID(),
        content:
          "I felt tired after a synthetic walk yesterday, but I am not sure why.",
        timezone: "Africa/Lagos",
      });
      const summary = await handoffSummary(
        db.pool,
        patient.session,
        id,
        gateway,
      );
      expect(summary.state).toBe("ready");
      expect(summary.attachment?.text).toMatch(/tired|walk/i);
      await sendCareMessage(
        db.pool,
        patient.session,
        { kind: "patient" },
        {
          connectionId,
          requestKey: randomUUID(),
          content: "Please advise about this synthetic concern.",
          originConversationId: id,
          summary: summary.attachment!,
        },
      );
      const inbox = await careMessages(
        db.pool,
        doctor.session,
        context,
        connectionId,
      );
      expect(inbox.items[0].summary_attachment.text).toBe(
        summary.attachment!.text,
      );
      await mkdir(".local/care-connected", { recursive: true });
      await writeFile(
        ".local/care-connected/live-evidence.json",
        JSON.stringify(
          {
            provider: gateway.provider,
            model: gateway.modelName,
            usage: gateway.observedUsage,
            suspectedFinding: run.proposals[0].body.text,
            sharedSyntheticSummary: summary.attachment!.text,
            checks:
              "reviewed finding and shared-summary journey passed; synthetic only",
          },
          null,
          2,
        ),
      );
    } finally {
      await db.stop();
    }
  },
  120000,
);
