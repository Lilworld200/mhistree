import "server-only";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess, type ActingContext } from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import {
  storedPractitionerProposal,
  proposalGaps,
} from "@/features/clinical-care/ai-proposal";
import { saveWorkInAccess } from "./work";
import { syncReviewedMedication } from "./medication-recommendations";
import { finalizeEntryInAccess } from "./entries";

/** A model can propose work, but only this explicit reviewed operation publishes it. */
export async function savePractitionerProposal(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({
      runId: z.uuid(),
      itemId: z.uuid(),
      destination: z.enum(["record", "note"]),
      reviewed: z.literal(true),
      text: z.string().trim().min(1).max(10000),
    })
    .strict()
    .parse(input);
  if (context.kind !== "direct" && context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");
  return withAccess(pool, session, context, async (a) => {
    // RLS verifies current participation; the stored run binds patient/actor/scope.
    const run = (
      await a.tx.query(
        "select * from mhistree.practitioner_ai_runs where id=$1 and account_id=$2 and connection_id=$3",
        [d.runId, a.actor.accountId, context.connectionId],
      )
    ).rows[0];
    if (!run) throw new DomainError("ACCESS_DENIED");
    const connection = (
      await a.tx.query(
        "select revision,status from mhistree.connections where id=$1",
        [context.connectionId],
      )
    ).rows[0];
    if (connection?.status !== "active") throw new DomainError("ACCESS_DENIED");
    if (run.response.accessRevision !== connection.revision)
      throw new DomainError("VERSION_CONFLICT");
    const proposals = z
      .array(storedPractitionerProposal)
      .max(8)
      .parse(run.response.proposals);
    const proposal = proposals.find((p) => p.id === d.itemId);
    if (!proposal) throw new DomainError("ACCESS_DENIED");
    if (d.destination === "record" && proposalGaps(proposal).length)
      throw new DomainError("VALIDATION_FAILED");
    if (
      d.destination === "record" &&
      Object.values(proposal.medicationDetails ?? {}).some(
        (detail) =>
          detail && !d.text.toLowerCase().includes(detail.toLowerCase()),
      )
    )
      throw new DomainError("VALIDATION_FAILED");
    // One stable operation per stored item. Retries replay; a changed destination
    // or edited body conflicts instead of publishing twice or converting a note.
    if (["medication-use", "prescription"].includes(proposal.category))
      await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `medication-workflow:${run.patient_person_id}`,
      ]);
    const work = await saveWorkInAccess(a, {
      requestKey: proposal.id,
      aiRunId: run.id,
      patientPersonId: run.patient_person_id,
      kind: d.destination === "record" ? "draft" : "private-note",
      category: proposal.category,
      body: { ...proposal.body, text: d.text },
      occurredAt: proposal.occurredAt,
      timezone: run.response.timezone,
    });
    if (d.destination === "note")
      return { destination: "note" as const, workId: work.id };
    const result = await finalizeEntryInAccess(a, {
      id: work.id,
      version: 1,
      requestKey: proposal.id,
      reviewed: true,
      status: proposal.status,
    });
    await syncReviewedMedication(a, {
      patientPersonId: run.patient_person_id,
      category: proposal.category,
      name: proposal.medicationDetails?.name ?? undefined,
      text: d.text,
      eventId: result.eventId,
      useStatus: proposal.body.medication?.useStatus,
    });
    if (run.response.originCareMessageId) {
      const message = (
        await a.tx.query(
          "select m.id from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where m.id=$1 and m.author_account_id=$2 and t.connection_id=$3",
          [
            run.response.originCareMessageId,
            a.actor.accountId,
            context.connectionId,
          ],
        )
      ).rows[0];
      if (!message) throw new DomainError("ACCESS_DENIED");
      await a.tx.query(
        "insert into mhistree.care_clinical_attachments(message_id,event_id,author_account_id) values($1,$2,$3) on conflict do nothing",
        [message.id, result.eventId, a.actor.accountId],
      );
    }
    return { destination: "record" as const, ...result };
  });
}
