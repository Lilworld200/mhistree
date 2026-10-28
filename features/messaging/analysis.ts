import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withAccess, type ActingContext } from "@/features/access/server";
import { requireCare } from "@/features/appointments/server";
import { DomainError } from "@/lib/errors";
import type { AIGateway } from "@/lib/ai/gateway";
import { practitionerAssistance } from "@/features/ai-chat/practitioner";
import { chatScope } from "@/features/clinical-care/practitioner-chat";
import { uncertainMedicineName } from "@/features/ai-chat/health-context";
import { storedPractitionerProposal } from "@/features/clinical-care/ai-proposal";
import {
  journalPolicy,
  validateExtraction,
} from "@/features/ai-chat/extraction/server";
import {
  recordSourceInAccess,
  acceptContributionInAccess,
} from "@/features/health-records/server";
import { inboxPatientContext } from "./patient-analysis";
import {
  modelExtractionContext,
  compatibleTimes,
  incidentTimeReference,
} from "@/features/ai-chat/extraction/context";
import { resolveTime } from "@/features/ai-chat/extraction/time";
import {
  captureMedicationCommitment,
  medicationStatement,
} from "@/features/clinical-care/medication-recommendations";

export async function inboxAnalysisStatus(
  pool: Pool,
  session: string,
  context: ActingContext,
  connectionId: string,
) {
  return withAccess(pool, session, context, async (a) => {
    await requireCare(a, connectionId, "messages.send");
    const jobs = (
      await a.tx.query(
        "select id,message_id,state,issue,attempts from mhistree.care_analysis_jobs where connection_id=$1 order by created_at desc,id desc limit 50",
        [connectionId],
      )
    ).rows;
    const findings =
      context.kind === "patient"
        ? []
        : (
            await a.tx.query(
              "select id,message_id,category,proposal,state,version from mhistree.care_pending_findings where connection_id=$1 and state in ('pending','reviewing','paused') and chat_scope=$2 order by created_at,id limit 50",
              [connectionId, await chatScope(a)],
            )
          ).rows;
    return { jobs, findings };
  });
}

/** A bounded, leased operation after delivery, never an AI reply in the thread. */
export async function processInboxAnalysis(
  pool: Pool,
  session: string,
  context: ActingContext,
  connectionId: string,
  gateway: AIGateway,
  requestedId?: string,
) {
  if (requestedId) z.uuid().parse(requestedId);
  const lease = randomUUID();
  const prepared = await withAccess(pool, session, context, async (a) => {
    const c = await requireCare(a, connectionId, "messages.send");
    const job = (
      await a.tx.query(
        `select * from mhistree.care_analysis_jobs where connection_id=$1 and ${requestedId ? "id=$2 and state in ('queued','failed','partial','running','paused')" : "(state='queued' or (state='running' and lease_until<clock_timestamp()))"} and not exists(select 1 from mhistree.care_analysis_jobs earlier join mhistree.care_messages em on em.id=earlier.message_id where earlier.connection_id=care_analysis_jobs.connection_id and earlier.state in ('queued','running') and em.sequence<(select sequence from mhistree.care_messages where id=care_analysis_jobs.message_id)) order by created_at,id limit 1 for update skip locked`,
        requestedId ? [connectionId, requestedId] : [connectionId],
      )
    ).rows[0];
    if (!job) return null;
    if (job.connection_revision !== c.revision) {
      await a.tx.query(
        "update mhistree.care_analysis_jobs set state='paused',issue='Sharing changed; review the source before resuming.',updated_at=clock_timestamp() where id=$1",
        [job.id],
      );
      return null;
    }
    if (job.state === "running" && job.lease_until > new Date()) return null;
    const message = (
      await a.tx.query(
        "select * from mhistree.care_messages where id=$1 and author_account_id=$2",
        [job.message_id, a.actor.accountId],
      )
    ).rows[0];
    if (!message) throw new DomainError("ACCESS_DENIED");
    const prior = (
      await a.tx.query(
        "select m.id,m.content,m.sent_at,m.author_account_id,case when m.sender_context->>'kind'='patient' then 'patient' when m.sender_context->>'kind' in ('direct','organization') then 'practitioner' else 'unknown' end author_role from mhistree.care_messages m where m.thread_id=$1 and m.sequence<$2 order by m.sequence desc limit 8",
        [message.thread_id, message.sequence],
      )
    ).rows.reverse();
    let size = 0;
    const bounded = prior
      .reverse()
      .filter((m) => {
        size += m.content.length;
        return size <= 8000;
      })
      .reverse();
    await a.tx.query(
      "update mhistree.care_analysis_jobs set state='running',lease_id=$2,lease_until=clock_timestamp()+interval '3 minutes',attempts=attempts+1,issue=null,updated_at=clock_timestamp() where id=$1",
      [job.id, lease],
    );
    return {
      job,
      message,
      prior: bounded,
      scope: context.kind === "patient" ? null : await chatScope(a),
      patientId: c.patient_person_id,
      patientContext:
        context.kind === "patient"
          ? await inboxPatientContext(
              a,
              message.thread_id,
              String(message.sequence),
            )
          : undefined,
    };
  });
  if (!prepared) return { state: "idle" };
  try {
    let output = prepared.job.output;
    if (!output) {
      if (context.kind === "patient") {
        const raw = await gateway.generate(
          `${journalPolicy}\nThis is a patient-authored inbox message. Earlier thread messages have explicit author roles and are interpretation context only. Extract ONLY the current patient's own clear report, never a practitioner's finding or recommendation. Only supplied previousReports are eligible for explicit links; use the existing same-report, correction, same-incident and episode-update rules. A bare answer to an ambiguous question is not evidence of use or resolution.`,
          [
            {
              role: "user",
              content: JSON.stringify({
                previousMessages: prepared.prior,
                ...modelExtractionContext(prepared.patientContext),
                current: {
                  content: prepared.message.content,
                  capturedAt: prepared.message.sent_at,
                  timezone: prepared.message.timezone,
                },
              }),
            },
          ],
          { json: true, purpose: "extraction" },
        );
        output = {
          kind: "patient",
          ...validateExtraction(
            JSON.parse(raw),
            prepared.message.content,
            false,
            prepared.patientContext,
          ),
        };
      } else {
        const response = await practitionerAssistance(
          pool,
          session,
          {
            connectionId,
            question: prepared.message.content,
            purpose: "draft",
            conversation: true,
            includeOwnNotes: false,
            originCareMessageId: prepared.message.id,
            timezone:
              prepared.message.timezone === "unknown"
                ? "Africa/Lagos"
                : prepared.message.timezone,
          },
          gateway,
          context.kind === "organization" ? context : undefined,
          {
            context: JSON.stringify(prepared.prior),
            practitionerTexts: prepared.prior
              .filter((m) => m.author_account_id === prepared.job.account_id)
              .map((m) => m.content),
          },
        );
        output = { kind: "practitioner", proposals: response.proposals };
      }
      await withAccess(pool, session, context, async (a) => {
        await requireCare(a, connectionId, "messages.send");
        const saved = await a.tx.query(
          "update mhistree.care_analysis_jobs set output=$3 where id=$1 and lease_id=$2 and state='running'",
          [prepared.job.id, lease, JSON.stringify(output)],
        );
        if (!saved.rowCount) throw new DomainError("VERSION_CONFLICT");
      });
    }
    return await withAccess(pool, session, context, async (a) => {
      const c = await requireCare(a, connectionId, "messages.send");
      const job = (
        await a.tx.query(
          "select * from mhistree.care_analysis_jobs where id=$1 and lease_id=$2 and state='running' for update",
          [prepared.job.id, lease],
        )
      ).rows[0];
      if (!job) throw new DomainError("VERSION_CONFLICT");
      if (
        c.revision !== job.connection_revision ||
        (context.kind !== "patient" && prepared.scope !== (await chatScope(a)))
      )
        throw new DomainError("ACCESS_REVOKED");
      let partial = false;
      if (output.kind === "practitioner") {
        for (const p of z
          .array(storedPractitionerProposal)
          .max(8)
          .parse(output.proposals)) {
          if (!p.sourceSpans.some((s) => prepared.message.content.includes(s)))
            continue;
          await a.tx.query(
            "insert into mhistree.care_pending_findings(id,job_id,message_id,account_id,patient_person_id,connection_id,acting_context,chat_scope,category,proposal) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do nothing",
            [
              p.id,
              job.id,
              job.message_id,
              a.actor.accountId,
              prepared.patientId,
              connectionId,
              JSON.stringify(context),
              prepared.scope,
              p.category,
              JSON.stringify(p),
            ],
          );
          if (
            p.category === "prescription" &&
            p.medicationDetails?.name &&
            !uncertainMedicineName(p.medicationDetails.name) &&
            !/\b(?:para|unknown|unsure|maybe|malaria drugs?|antibiotics?|medicine|medication|tablets?|pills?)\b/i.test(
              p.medicationDetails.name,
            ) &&
            !p.missingDetails.some((g) =>
              /name|identity|which medicine/i.test(g),
            )
          ) {
            await a.tx.query(
              "insert into mhistree.medication_recommendations(patient_person_id,author_account_id,connection_id,source_message_id,name,details) values($1,$2,$3,$4,$5,$6) on conflict(source_message_id,name) do nothing",
              [
                prepared.patientId,
                a.actor.accountId,
                connectionId,
                job.message_id,
                p.medicationDetails.name,
                prepared.message.content.slice(0, 2000),
              ],
            );
          }
        }
      } else {
        await captureMedicationCommitment(a, {
          id: prepared.message.id,
          threadId: prepared.message.thread_id,
          source: "care",
          content: prepared.message.content,
          timezone: prepared.message.timezone,
        });
        partial = output.issues.length > 0;
        for (const saved of output.items) {
          const item = saved.item;
          const use =
            item.category === "medication-use" && item.medicationName
              ? medicationStatement(
                  prepared.message.content,
                  item.medicationName,
                )
              : null;
          if (item.category === "medication-use") {
            const captured = (
              await a.tx.query(
                "select 1 from mhistree.medication_commitments mc join mhistree.medication_recommendations r on r.id=mc.recommendation_id where mc.care_message_id=$1 and lower(r.name)=lower($2)",
                [prepared.message.id, item.medicationName],
              )
            ).rowCount;
            if (captured) continue;
            if (!use || use === "declined") {
              partial = true;
              continue;
            }
          }
          const prior = item.relation
            ? output.context?.reports.find(
                (r: { id: string }) => r.id === item.relation.eventId,
              )
            : undefined;
          const later = item.relation?.kind === "episode-update";
          const reportedTime = resolveTime(
            item.timePhrase,
            new Date(prepared.message.sent_at),
            prepared.message.timezone,
          );
          const retainTime =
            prior &&
            !later &&
            reportedTime.precision === "unknown" &&
            (!item.timePhrase || incidentTimeReference(item.timePhrase));
          if (
            prior &&
            !later &&
            item.relation?.kind !== "correction" &&
            !retainTime &&
            !compatibleTimes(prior.eventTime, reportedTime)
          )
            throw new DomainError("VERSION_CONFLICT");
          let occurredAt = retainTime ? prior.eventTime : reportedTime;
          if (
            prior &&
            item.relation?.kind === "same-incident" &&
            reportedTime.precision === "unknown" &&
            occurredAt.precision === "exact"
          )
            occurredAt = { precision: "unknown" };
          const source = await recordSourceInAccess(a, {
            patientPersonId: prepared.patientId,
            category: item.category === "result" ? "document" : item.category,
            sourceTimezone: prepared.message.timezone,
            content: prepared.message.content,
            clientKey: saved.sourceKey,
            careMessageId: prepared.message.id,
          });
          await acceptContributionInAccess(a, {
            sourceId: source.sourceId,
            sourceVersion: source.version,
            sourceItemId: saved.key,
            operationKey: saved.operationKey,
            body: {
              text: item.text,
              bodySite:
                item.bodySite ??
                (item.relation?.kind === "same-report"
                  ? prior?.body.bodySite
                  : null),
              contextLinks: prior
                ? item.relation.kind === "same-report"
                  ? prior.body.contextLinks
                  : [prior.id]
                : [],
              ...(prior && later
                ? {
                    episodeUpdate: {
                      eventId: prior.id,
                      expectedVersion: prior.version,
                    },
                  }
                : {}),
              ...(item.reportStyle ? { reportStyle: item.reportStyle } : {}),
              ...(use
                ? {
                    medication: {
                      useStatus: use === "planned" ? "not-started" : use,
                      commitment: use === "planned",
                      plannedStart: null,
                      plannedEnd: null,
                      actualStart: null,
                      actualEnd: null,
                    },
                  }
                : {}),
            },
            occurredAt,
            ...(prior &&
            ["same-report", "correction"].includes(item.relation.kind)
              ? {
                  correction: {
                    logicalId: prior.logicalId,
                    expectedVersion: prior.version,
                  },
                }
              : {}),
            status: item.status,
            sourceSpans: [item.quote],
          });
        }
      }
      await a.tx.query(
        "update mhistree.care_analysis_jobs set state=$3,lease_until=null,issue=$4,updated_at=clock_timestamp() where id=$1 and lease_id=$2",
        [
          job.id,
          lease,
          partial ? "partial" : "completed",
          partial
            ? "Some details need clarification. Original messages are retained."
            : null,
        ],
      );
      return { state: partial ? "partial" : "completed" };
    });
  } catch (error) {
    try {
      await withAccess(pool, session, context, (a) =>
        a.tx.query(
          "update mhistree.care_analysis_jobs set state=$3,lease_until=null,issue=$4,updated_at=clock_timestamp() where id=$1 and lease_id=$2",
          [
            prepared.job.id,
            lease,
            error instanceof DomainError &&
            ["ACCESS_DENIED", "ACCESS_REVOKED"].includes(error.code)
              ? "paused"
              : "failed",
            "Analysis did not finish. The message was delivered; retry analysis when ready.",
          ],
        ),
      );
    } catch {
      /* Current authority may have ended; lease remains recoverable. */
    }
    return { state: "failed" };
  }
}

/** Materialize a reviewed-source conversation turn only when its author opens it. */
export async function openInboxFindings(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      action: z.enum(["review", "dismiss"]),
    })
    .strict()
    .parse(input);
  return withAccess(pool, session, context, async (a) => {
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `practitioner-review:${a.actor.accountId}:${a.contextId}`,
    ]);
    const row = (
      await a.tx.query(
        "select * from mhistree.care_pending_findings where id=$1 for update",
        [d.id],
      )
    ).rows[0];
    if (
      !row ||
      (context.kind !== "direct" && context.kind !== "organization") ||
      context.connectionId !== row.connection_id
    )
      throw new DomainError("ACCESS_DENIED");
    if (
      row.chat_scope !== (await chatScope(a)) ||
      row.version !== d.version ||
      !["pending", "reviewing"].includes(row.state)
    )
      throw new DomainError("VERSION_CONFLICT");
    if (d.action === "dismiss") {
      await a.tx.query(
        "update mhistree.care_pending_findings set state='dismissed',version=version+1 where id=$1",
        [d.id],
      );
      return { dismissed: true };
    }
    const rows = (
      await a.tx.query(
        "select * from mhistree.care_pending_findings where job_id=$1 and state in ('pending','reviewing') order by id for update",
        [row.job_id],
      )
    ).rows;
    const message = (
      await a.tx.query(
        "select content,timezone,sent_at from mhistree.care_messages where id=$1",
        [row.message_id],
      )
    ).rows[0];
    const id = randomUUID();
    await a.tx.query(
      "insert into mhistree.practitioner_ai_runs(id,account_id,connection_id,patient_person_id,purpose,question,response,evidence_ids,private_note_ids) values($1,$2,$3,$4,'draft',$5,$6,'{}','{}')",
      [
        id,
        a.actor.accountId,
        row.connection_id,
        row.patient_person_id,
        message.content,
        JSON.stringify({
          text: "Review these inbox findings. Complete missing fields or continue typing.",
          proposals: rows.map((r) => r.proposal),
          evidenceIds: [],
          limitations: [],
          chatScope: row.chat_scope,
          originalContext: context,
          accessRevision: JSON.parse(row.chat_scope).revision,
          timezone:
            message.timezone === "unknown" ? "Africa/Lagos" : message.timezone,
          submittedAt: message.sent_at,
          originCareMessageId: row.message_id,
          inboxFindingIds: rows.map((r) => r.id),
        }),
      ],
    );
    await a.tx.query(
      "update mhistree.care_pending_findings set state='reviewing',review_run_id=$2,version=version+1 where id=any($1::uuid[])",
      [rows.map((r) => r.id), id],
    );
    return { id };
  });
}
