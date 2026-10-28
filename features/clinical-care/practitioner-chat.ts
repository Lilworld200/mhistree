import "server-only";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  withAccess,
  type ActingContext,
  type AccessTransaction,
} from "@/features/access/server";
import { category, eventTime } from "@/features/health-records/schema";
import { DomainError } from "@/lib/errors";
import {
  careNoteFields,
  careNoteInput,
  careNoteBody,
} from "./care-note-schema";
import { storedPractitionerProposal } from "./ai-proposal";
import { lockNoteContext, saveCareNoteInAccess } from "./care-notes";

/** History is private to this author and exact context, and withheld after scope changes. */
export async function chatScope(a: AccessTransaction) {
  if (a.context.kind !== "direct" && a.context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");
  const connection = (
    await a.tx.query(
      "select patient_person_id,revision from mhistree.connections where id=$1 and status='active'",
      [a.context.connectionId],
    )
  ).rows[0];
  if (!connection) throw new DomainError("ACCESS_DENIED");
  const rights = (
    await a.tx.query(
      "select category,mhistree.can_access($1,$1,category,'finalized',$2,$3,'read',$4) r,mhistree.can_access($1,$1,category,'private',$2,$3,'write',$4) w from unnest($5::text[]) category order by category",
      [
        connection.patient_person_id,
        a.actor.accountId,
        a.contextId,
        a.context.kind === "organization" ? a.context.organizationId : null,
        category.options,
      ],
    )
  ).rows;
  if (!rights.some((r) => r.r)) throw new DomainError("ACCESS_DENIED");
  return JSON.stringify({
    context: a.context,
    revision: connection.revision,
    rights,
  });
}

function allowsLegacyDirect(context: ActingContext, scope: string) {
  const rights = JSON.parse(scope).rights as { r: boolean; w: boolean }[];
  return (
    context.kind === "direct" && rights.every((right) => !right.r || right.w)
  );
}
const position = z
  .object({ at: z.iso.datetime({ offset: true }), id: z.uuid() })
  .strict();
export async function practitionerChatHistory(
  pool: Pool,
  session: string,
  context: ActingContext,
  before?: string,
) {
  let cursor: z.infer<typeof position> | null = null;
  if (before) {
    try {
      if (before.length > 1000) throw Error();
      cursor = position.parse(
        JSON.parse(Buffer.from(before, "base64url").toString()),
      );
    } catch {
      throw new DomainError("VALIDATION_FAILED");
    }
  }
  return withAccess(pool, session, context, async (a) => {
    if (context.kind !== "direct" && context.kind !== "organization")
      throw new DomainError("ACCESS_DENIED");
    const scope = await chatScope(a);
    const rows = (
      await a.tx.query(
        `select id,question,response,created_at,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') cursor_at from mhistree.practitioner_ai_runs
       where account_id=$1 and connection_id=$2 and (response->>'chatScope'=$3 or ($6::boolean and response->>'chatScope' is null and response->>'accessRevision'=$7))
       and coalesce(response->>'reviewStage','false') <> 'true'
       and ($4::timestamptz is null or (created_at,id)<($4,$5::uuid))
       order by created_at desc,id desc limit 31`,
        [
          a.actor.accountId,
          context.connectionId,
          scope,
          cursor?.at ?? null,
          cursor?.id ?? null,
          allowsLegacyDirect(context, scope),
          String(JSON.parse(scope).revision),
        ],
      )
    ).rows;
    const page = rows.slice(0, 30),
      last = page.at(-1);
    const ids = page.flatMap((r) =>
      (r.response.proposals ?? []).map((p: { id: string }) => p.id),
    );
    const saved = (
      await a.tx.query(
        "select request_key,kind from mhistree.clinical_work where author_account_id=$1 and original_context=$2 and request_key=any($3::uuid[])",
        [a.actor.accountId, a.contextId, ids],
      )
    ).rows;
    const latest = !before
      ? (
          await a.tx.query(
            "select id,question,response from mhistree.practitioner_ai_runs where account_id=$1 and connection_id=$2 and response->>'chatScope'=$3 order by created_at desc,id desc limit 1",
            [a.actor.accountId, context.connectionId, scope],
          )
        ).rows[0]
      : null;
    const pendingDraft = latest?.response.reviewStage
      ? {
          runId: latest.response.runId,
          destination: latest.response.entries[0].destination,
          items: latest.response.entries.map(
            (entry: z.infer<typeof careNoteInput>) => ({
              id: entry.requestKey,
              fields: entry.fields,
            }),
          ),
          version:
            Date.parse(latest.response.expiresAt) > Date.now()
              ? {
                  id: latest.id,
                  text: latest.question,
                  expiresAt: latest.response.expiresAt,
                }
              : null,
        }
      : null;
    return {
      pendingDraft,
      items: page.reverse().map((r) => ({
        id: r.id,
        question: r.question,
        ...r.response,
        proposals: (r.response.proposals ?? []).filter(
          (p: { id: string }) => !saved.some((w) => w.request_key === p.id),
        ),
      })),
      nextCursor:
        rows.length > 30 && last
          ? Buffer.from(
              JSON.stringify({
                at: last.cursor_at,
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  });
}

const reviewInput = z
  .object({
    runId: z.uuid(),
    destination: z.enum(["note", "record"]),
    timezone: z.string().max(100),
    items: z
      .array(z.object({ id: z.uuid(), fields: careNoteFields }).strict())
      .min(1)
      .max(8),
  })
  .strict();
function timeText(time: z.infer<typeof eventTime>) {
  if (time.precision === "unknown")
    return time.originalPhrase ? `unknown (${time.originalPhrase})` : "unknown";
  if (time.precision === "exact") return time.at;
  return `${time.from} to ${time.to}${time.precision === "approximate" ? ` (${time.originalPhrase})` : ""}`;
}

async function ownedRun(a: AccessTransaction, id: string, scope: string) {
  if (a.context.kind !== "direct" && a.context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");
  const run = (
    await a.tx.query(
      "select * from mhistree.practitioner_ai_runs where id=$1 and account_id=$2 and connection_id=$3",
      [id, a.actor.accountId, a.context.connectionId],
    )
  ).rows[0];
  const legacyDirect =
    run &&
    !run.response.chatScope &&
    allowsLegacyDirect(a.context, scope) &&
    run.response.accessRevision === JSON.parse(scope).revision;
  if (!run || (run.response.chatScope !== scope && !legacyDirect))
    throw new DomainError("ACCESS_DENIED");
  return run;
}

async function insertTurn(
  a: AccessTransaction,
  patient: string,
  question: string,
  response: Record<string, unknown>,
  id = randomUUID(),
) {
  if (a.context.kind !== "direct" && a.context.kind !== "organization")
    throw new DomainError("ACCESS_DENIED");
  return (
    await a.tx.query(
      "insert into mhistree.practitioner_ai_runs(account_id,connection_id,patient_person_id,purpose,question,response,evidence_ids,private_note_ids,id) values($1,$2,$3,'draft',$4,$5,'{}','{}',$6) returning id,question,response",
      [
        a.actor.accountId,
        a.context.connectionId,
        patient,
        question,
        JSON.stringify(response),
        id,
      ],
    )
  ).rows[0];
}

/** A review version is immutable private metadata, never a delivered practitioner message. */
export async function preparePractitionerReview(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = reviewInput.parse(input);
  return withAccess(
    pool,
    session,
    context,
    async (a) => {
      const scope = await chatScope(a),
        run = await ownedRun(a, d.runId, scope);
      if (run.response.reviewStage || !run.response.proposals?.length)
        throw new DomainError("VALIDATION_FAILED");
      await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `practitioner-review:${a.actor.accountId}:${a.contextId}`,
      ]);
      const latest = (
        await a.tx.query(
          "select id from mhistree.practitioner_ai_runs where account_id=$1 and connection_id=$2 and (response->>'chatScope'=$3 or ($4::boolean and response->>'chatScope' is null and response->>'accessRevision'=$5)) and coalesce(response->>'reviewStage','false')<>'true' order by created_at desc,id desc limit 1",
          [
            a.actor.accountId,
            run.connection_id,
            scope,
            allowsLegacyDirect(context, scope),
            String(JSON.parse(scope).revision),
          ],
        )
      ).rows[0];
      if (latest?.id !== run.id) throw new DomainError("VERSION_CONFLICT");
      const proposals = z
        .array(storedPractitionerProposal)
        .parse(run.response.proposals);
      if (new Set(d.items.map((i) => i.id)).size !== d.items.length)
        throw new DomainError("VALIDATION_FAILED");
      const consumed = await a.tx.query(
        "select id from mhistree.clinical_work where author_account_id=$1 and original_context=$2 and request_key=any($3::uuid[]) limit 1",
        [a.actor.accountId, a.contextId, d.items.map((i) => i.id)],
      );
      if (consumed.rowCount) throw new DomainError("VERSION_CONFLICT");
      const entries = d.items.map((item) => {
        const proposal = proposals.find((p) => p.id === item.id);
        if (!proposal) throw new DomainError("ACCESS_DENIED");
        return careNoteInput.parse({
          requestKey: proposal.id,
          patientPersonId: run.patient_person_id,
          destination: d.destination,
          category: proposal.category,
          fields: item.fields,
          timezone: d.timezone,
          reviewed: true,
        });
      });
      // Serialize exactly the validated reviewed fields; no second extraction/model call.
      const text =
        `${d.destination === "note" ? "Save as my private notes" : "Save to the patient record"}:\n\n` +
        entries
          .map(
            (e) =>
              careNoteBody(e).text +
              (e.destination === "record"
                ? `\nEvent date: ${e.fields.eventDate || timeText(proposals.find((p) => p.id === e.requestKey)!.occurredAt)}. Timezone: ${e.timezone}.`
                : ""),
          )
          .join("\n\n");
      if (text.length > 20000) throw new DomainError("VALIDATION_FAILED");
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const stage = await insertTurn(a, run.patient_person_id, text, {
        reviewStage: true,
        chatScope: scope,
        runId: run.id,
        entries,
        expiresAt,
      });
      return { id: stage.id, text, expiresAt };
    },
    (tx, actor) => lockNoteContext(tx, actor, context),
  );
}

/** All reviewed findings, their Health state and normal attributed chat text commit together. */
export async function confirmPractitionerReview(
  pool: Pool,
  session: string,
  context: ActingContext,
  input: unknown,
) {
  const d = z
    .object({ reviewId: z.uuid(), reviewed: z.literal(true) })
    .strict()
    .parse(input);
  return withAccess(
    pool,
    session,
    context,
    async (a) => {
      const scope = await chatScope(a),
        stage = await ownedRun(a, d.reviewId, scope);
      if (!stage.response.reviewStage)
        throw new DomainError("VALIDATION_FAILED");
      await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `practitioner-review:${a.actor.accountId}:${a.contextId}`,
      ]);
      const receipt = (
        await a.tx.query(
          "select id,question,response from mhistree.practitioner_ai_runs where account_id=$1 and connection_id=$2 and response->>'approvedReviewId'=$3",
          [a.actor.accountId, stage.connection_id, stage.id],
        )
      ).rows[0];
      if (receipt)
        return {
          id: receipt.id,
          question: receipt.question,
          ...receipt.response,
        };
      if (Date.parse(stage.response.expiresAt) < Date.now())
        throw new DomainError("VERSION_CONFLICT");
      // A different message or review invalidates the exact displayed Send question.
      const latest = (
        await a.tx.query(
          "select id from mhistree.practitioner_ai_runs where account_id=$1 and connection_id=$2 and response->>'chatScope'=$3 order by created_at desc,id desc limit 1",
          [a.actor.accountId, stage.connection_id, scope],
        )
      ).rows[0];
      if (latest?.id !== stage.id) throw new DomainError("VERSION_CONFLICT");
      const entries = z
        .array(careNoteInput)
        .min(1)
        .max(8)
        .parse(stage.response.entries);
      const consumed = await a.tx.query(
        "select id from mhistree.clinical_work where author_account_id=$1 and original_context=$2 and request_key=any($3::uuid[]) limit 1",
        [a.actor.accountId, a.contextId, entries.map((e) => e.requestKey)],
      );
      if (consumed.rowCount) throw new DomainError("VERSION_CONFLICT");
      const original = await ownedRun(a, stage.response.runId, scope);
      if (original.response.inboxFindingIds?.length) {
        const active = await a.tx.query(
          "select id from mhistree.care_pending_findings where id=any($1::uuid[]) and state='reviewing' and review_run_id=$2 for update",
          [original.response.inboxFindingIds, original.id],
        );
        if (active.rowCount !== original.response.inboxFindingIds.length)
          throw new DomainError("VERSION_CONFLICT");
      }
      const proposals = z
        .array(storedPractitionerProposal)
        .parse(original.response.proposals);
      const results = [];
      const approvalMessageId = randomUUID();
      // A single lock order across mixed medication/condition cards avoids cross-card deadlocks.
      if (
        entries.some((e) =>
          ["prescription", "medication-use"].includes(e.category),
        )
      )
        await a.tx.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [`medication-workflow:${stage.patient_person_id}`],
        );
      for (const entry of [...entries].sort(
        (x, y) =>
          (x.category === "prescription"
            ? 0
            : x.category === "medication-use"
              ? 2
              : 1) -
            (y.category === "prescription"
              ? 0
              : y.category === "medication-use"
                ? 2
                : 1) || x.requestKey.localeCompare(y.requestKey),
      ))
        results.push(
          await saveCareNoteInAccess(
            a,
            entry,
            stage.response.runId,
            {
              reviewId: stage.id,
              approvalMessageId,
              ...(original.response.originCareMessageId
                ? { originCareMessageId: original.response.originCareMessageId }
                : {}),
            },
            entry.destination === "record"
              ? proposals.find((p) => p.id === entry.requestKey)?.occurredAt
              : undefined,
          ),
        );
      if (original.response.inboxFindingIds?.length) {
        const included = entries.map((e) => e.requestKey);
        await a.tx.query(
          "update mhistree.care_pending_findings set state=case when id=any($2::uuid[]) then $3 else 'pending' end,review_run_id=case when id=any($2::uuid[]) then review_run_id else null end,version=version+1 where id=any($1::uuid[])",
          [
            original.response.inboxFindingIds,
            included,
            entries[0].destination === "note" ? "private" : "recorded",
          ],
        );
      }
      const response = {
        text:
          entries[0].destination === "note"
            ? "Private notes saved. Only you can view them."
            : "Reviewed findings saved to the patient record.",
        evidenceIds: [],
        limitations: [],
        proposals: [],
        results,
        approvedReviewId: stage.id,
        previousRunId: original.id,
        chatScope: scope,
        originalContext: context,
        accessRevision: original.response.accessRevision,
        timezone: entries[0].timezone,
        submittedAt: new Date().toISOString(),
      };
      const turn = await insertTurn(
        a,
        stage.patient_person_id,
        stage.question,
        response,
        approvalMessageId,
      );
      return { id: turn.id, question: turn.question, ...response };
    },
    (tx, actor) => lockNoteContext(tx, actor, context),
  );
}
