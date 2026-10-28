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
    if (
      proposal.category === "prescription" &&
      proposal.medicationDetails?.name
    ) {
      await a.tx.query(
        "insert into mhistree.medication_recommendations(patient_person_id,author_account_id,connection_id,source_event_id,name,details) values($1,$2,$3,$4,$5,$6) on conflict(source_event_id,name) do nothing",
        [
          run.patient_person_id,
          a.actor.accountId,
          context.connectionId,
          result.eventId,
          proposal.medicationDetails.name,
          d.text.slice(0, 2000),
        ],
      );
    }
    if (
      proposal.category === "medication-use" &&
      proposal.medicationDetails?.name &&
      proposal.body.medication &&
      ["taking", "stopped"].includes(proposal.body.medication.useStatus)
    ) {
      await a.tx.query(
        "update mhistree.medication_recommendations set state=case when disposition is not null then disposition else $4 end,use_state=$4,followups_closed=true,latest_event_id=$5,version=version+1 where patient_person_id=$1 and connection_id=$2 and lower(name)=lower($3) and latest_event_id is distinct from $5",
        [
          run.patient_person_id,
          context.connectionId,
          proposal.medicationDetails.name,
          proposal.body.medication.useStatus,
          result.eventId,
        ],
      );
    }
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
