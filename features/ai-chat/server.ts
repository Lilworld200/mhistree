import "server-only";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withAccess, type AccessTransaction } from "@/features/access/server";
import {
  captureMedicationCommitment,
  pendingRecommendations,
  medicationQuestion,
} from "@/features/clinical-care/medication-recommendations";
import { appendEvent } from "@/features/audit/server";
import { consumeAttempt } from "@/lib/db/rate-limit";
import { digest } from "@/features/auth/sessions";
import { DomainError, applicationErrorCode } from "@/lib/errors";
import type { AIGateway, AIMessage } from "@/lib/ai/gateway";
import { retrieveEvidence, retrieveEvidenceInAccess } from "./retrieval";
import { patientIdentity } from "./profile-context";
import { patientChatPolicy } from "./patient-prompt";
import { aiDebug, debugMessage, debugRef, withAIDebug } from "@/lib/ai/debug";
import { practitionerDiscovery } from "./practitioner-discovery";
import { verifiedTranscript } from "./speech/server";
import {
  linkPreviousConversation,
  memoryReady,
  recallMemory,
  recallMemoryInAccess,
} from "./memory";
import { conversationPreview } from "./conversation";
import { continuityPolicy, timeAnchor } from "./temporal";
import { boundedHistory, contextPlan } from "./context-plan";
import { replyText } from "./reply-text";
import { careActionPolicy, type CareOptions } from "./care-action-schema";
import { appointmentDiscovery, storeCareProposal } from "./care-actions";
import {
  claimTypedCareConfirmation,
  confirmCareMessages,
  decoratedProposal,
  invalidateCareConfirmation,
  latestCareProposal,
} from "./care-delivery";
import {
  medicationSafetyContext,
  contactOfferAccepted,
  groundedContactDraft,
  replyDialogue,
  conversationalHealthText,
  uncertainMedicineName,
  requestedCareAction,
  unresolvedMedicineName,
  careDraftRecovery,
  previouslyRequestedCare,
  claimsCareOperation,
} from "./health-context";
const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
});
const sendInput = z
  .object({
    conversationId: z.uuid(),
    requestKey: z.uuid(),
    content: z.string().min(1).max(10000),
    timezone,
    inputMethod: z.enum(["text", "microphone"]).default("text"),
    transcriptionToken: z.string().min(1).max(65536).optional(),
    careConfirmationId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (data) =>
      (data.inputMethod === "microphone") === Boolean(data.transcriptionToken),
  );
export async function createConversation(
  pool: Pool,
  session: string,
  id: string,
  previousConversationId?: string,
) {
  z.uuid().parse(id);
  return withAccess(pool, session, { kind: "patient" }, async (access) => {
    await access.tx.query(
      "select pg_advisory_xact_lock(hashtextextended($1,0))",
      [`chat-create:${id}`],
    );
    await access.tx.query(
      "insert into mhistree.conversations(id,person_id,account_id) values($1,$2,$3) on conflict do nothing",
      [id, access.actor.personId, access.actor.accountId],
    );
    const row = (
      await access.tx.query(
        "select id from mhistree.conversations where id=$1 and account_id=$2",
        [id, access.actor.accountId],
      )
    ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    if (previousConversationId)
      await linkPreviousConversation(access, id, previousConversationId);
    if (previousConversationId)
      await invalidateCareConfirmation(access, previousConversationId);
    return row;
  });
}
export async function listConversations(pool: Pool, session: string) {
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const rows = (
      await a.tx.query(
        `select c.id,c.created_at,t.title,
      (select m.content from mhistree.chat_messages m where m.conversation_id=c.id and m.role='patient' order by m.sequence limit 1) preview
      from mhistree.conversations c left join mhistree.chat_titles t on t.conversation_id=c.id
      where c.account_id=$1 order by c.created_at desc,c.id desc limit 30`,
        [a.actor.accountId],
      )
    ).rows;
    return rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      title: r.title ?? conversationPreview(r.preview ?? ""),
      titleReady: Boolean(r.title),
    }));
  });
}
export async function conversationHistory(
  pool: Pool,
  session: string,
  id: string,
  before?: string,
) {
  z.uuid().parse(id);
  if (before)
    z.string()
      .regex(/^\d{1,18}$/)
      .parse(before);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    if (
      !(
        await a.tx.query("select id from mhistree.conversations where id=$1", [
          id,
        ])
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const rows = (
      await a.tx.query(
        `select m.id,m.sequence::text,m.role,m.content,m.timezone,m.captured_at,m.reply_to,(select jsonb_build_object('id',cp.id,'conversationId',m.conversation_id,'kind',cp.kind,'payload',cp.payload,'state',cp.state,'version',cp.version,'result_id',cp.result_id,'deliveries',(select coalesce(jsonb_agg(jsonb_build_object('connectionId',d.connection_id,'state',d.state,'resultId',d.result_id,'errorCode',d.error_code)),'[]'::jsonb) from mhistree.chat_care_deliveries d where d.proposal_id=cp.id)) from mhistree.chat_care_proposals cp where cp.reply_message_id=m.id) as "careProposal",coalesce(to_jsonb(m)->>'input_method','text') as "inputMethod",to_jsonb(m)->'transcription' as transcription,(select coalesce(to_jsonb(p)->>'input_method','text') from mhistree.chat_messages p where p.id=m.reply_to) as "replyInputMethod",g.state,g.error_code from mhistree.chat_messages m left join mhistree.chat_generations g on g.message_id=m.id where m.conversation_id=$1 and ($2::bigint is null or m.sequence<$2::bigint) order by m.sequence desc limit 51`,
        [id, before ?? null],
      )
    ).rows;
    const more = rows.length > 50;
    const page = rows.slice(0, 50);
    const latestCare = await latestCareProposal(a, id);
    return {
      pendingCareProposal:
        latestCare &&
        ["draft", "partial", "failed", "sending"].includes(latestCare.state)
          ? latestCare
          : null,
      memoryReady: await memoryReady(a, id),
      items: page.reverse().map((m) => ({
        ...m,
        content: m.role === "assistant" ? replyText(m.content) : m.content,
      })),
      nextCursor: more ? page[0].sequence : null,
    };
  });
}
export async function sendMessage(pool: Pool, session: string, input: unknown) {
  return withAIDebug({ operation: "chat.send" }, async () => {
    const result = await saveMessage(pool, session, input);
    debugMessage(result.messageId);
    aiDebug("chat.message.saved", { state: "queued" });
    return result;
  });
}
async function saveMessage(pool: Pool, session: string, input: unknown) {
  const data = sendInput.parse(input);
  await consumeAttempt(pool, "chat.send", digest(session), 30);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const receipt = data.transcriptionToken
      ? await verifiedTranscript(
          data.transcriptionToken,
          a.actor.accountId,
          a.actor.sessionId,
        )
      : null;
    if (receipt) {
      await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `transcript:${receipt.id}`,
      ]);
      if (
        (
          await a.tx.query(
            "select 1 from mhistree.care_messages where transcription->>'id'=$1",
            [receipt.id],
          )
        ).rowCount
      )
        throw new DomainError("VERSION_CONFLICT");
    }
    const transcription = receipt
      ? {
          id: receipt.id,
          text: receipt.text,
          model: receipt.model,
          capturedAt: receipt.capturedAt,
          audioSha256: receipt.audioSha256,
          durationSeconds: receipt.durationSeconds,
        }
      : null;
    await a.tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `chat:${data.conversationId}`,
    ]);
    if (
      !(
        await a.tx.query("select id from mhistree.conversations where id=$1", [
          data.conversationId,
        ])
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const existing = (
      await a.tx.query(
        "select * from mhistree.chat_messages where account_id=$1 and request_key=$2",
        [a.actor.accountId, data.requestKey],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.content !== data.content ||
        existing.conversation_id !== data.conversationId ||
        existing.timezone !== data.timezone ||
        (existing.care_confirmation_id ?? null) !==
          (data.careConfirmationId ?? null) ||
        (existing.input_method ?? "text") !== data.inputMethod ||
        (existing.transcription?.id ?? null) !== (transcription?.id ?? null)
      )
        throw new DomainError("VERSION_CONFLICT");
      return { messageId: existing.id as string };
    }
    const id = randomUUID();
    const inserted = await a.tx.query(
      data.inputMethod === "microphone"
        ? "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,request_key,input_method,transcription,care_confirmation_id) values($1,$2,$3,$4,'patient',$5,$6,$7,$8,$9,$10) on conflict do nothing returning id"
        : "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,request_key,care_confirmation_id) values($1,$2,$3,$4,'patient',$5,$6,$7,$8) on conflict do nothing returning id",
      [
        id,
        data.conversationId,
        a.actor.personId,
        a.actor.accountId,
        data.content,
        data.timezone,
        data.requestKey,
        ...(data.inputMethod === "microphone"
          ? [data.inputMethod, transcription]
          : []),
        data.careConfirmationId ?? null,
      ],
    );
    if (!inserted.rowCount) throw new DomainError("VERSION_CONFLICT");
    await a.tx.query(
      "insert into mhistree.chat_generations(message_id) values($1)",
      [id],
    );
    await captureMedicationCommitment(a, {
      id,
      conversationId: data.conversationId,
      content: data.content,
      timezone: data.timezone,
    });
    await a.tx.query(
      "insert into mhistree.extraction_jobs(account_id,message_id) values($1,$2)",
      [a.actor.accountId, id],
    );
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: a.actor.personId,
      action: "chat.message.saved",
      referenceId: id,
    });
    return { messageId: id };
  });
}
export async function generateReply(
  pool: Pool,
  session: string,
  messageId: string,
  gateway: AIGateway,
  signal?: AbortSignal,
  continueWithoutMemory = false,
) {
  return withAIDebug(
    { operation: "chat.reply", messageRef: debugRef(messageId) },
    () =>
      generatePatientReply(
        pool,
        session,
        messageId,
        gateway,
        signal,
        continueWithoutMemory,
      ),
  );
}
async function generatePatientReply(
  pool: Pool,
  session: string,
  messageId: string,
  gateway: AIGateway,
  signal?: AbortSignal,
  continueWithoutMemory = false,
) {
  z.uuid().parse(messageId);
  const lease = randomUUID();
  let profile!: Awaited<ReturnType<typeof patientIdentity>>;
  const prepared = await withAccess(
    pool,
    session,
    { kind: "patient" },
    async (a) => {
      const message = (
        await a.tx.query(
          "select * from mhistree.chat_messages where id=$1 and role='patient'",
          [messageId],
        )
      ).rows[0];
      if (!message) throw new DomainError("ACCESS_DENIED");
      if (
        !continueWithoutMemory &&
        !(await memoryReady(a, message.conversation_id))
      )
        throw new DomainError("MEMORY_PREPARATION_REQUIRED");
      const claim = await a.tx.query(
        "update mhistree.chat_generations set state='running',attempts=attempts+1,lease_id=$2,lease_until=clock_timestamp()+interval '60 seconds',error_code=null,updated_at=clock_timestamp() where message_id=$1 and attempts<5 and (state in ('queued','failed') or (state='running' and lease_until<clock_timestamp())) returning message_id",
        [messageId, lease],
      );
      if (!claim.rowCount) return null;
      const history = (
        await a.tx.query(
          "select m.id,m.role,m.content,m.captured_at,m.timezone,m.dialogue,(select jsonb_build_object('kind',p.kind,'state',p.state,'reviewedText',case when p.state='completed' then p.payload->>'content' else null end) from mhistree.chat_care_proposals p where p.reply_message_id=m.id) as care_outcome from mhistree.chat_messages m where m.conversation_id=$1 and m.sequence<=$2 order by m.sequence desc limit 20",
          [message.conversation_id, message.sequence],
        )
      ).rows.reverse();
      const initial = !(
        await a.tx.query(
          "select 1 from mhistree.chat_messages where conversation_id=$1 and role='patient' and sequence>coalesce((select target_sequence from mhistree.chat_memory_links where conversation_id=$1),0) and sequence<$2 limit 1",
          [message.conversation_id, message.sequence],
        )
      ).rowCount;
      return { message, history, personId: a.actor.personId, initial };
    },
    async (tx, actor) => {
      profile = await patientIdentity(tx, actor);
    },
  );
  if (!prepared) {
    aiDebug("chat.reply.unchanged", { reason: "not-claimable" });
    return { state: "unchanged" };
  }
  aiDebug("chat.reply.claimed", { messageCount: prepared.history.length });
  try {
    const confirmation = await claimTypedCareConfirmation(
      pool,
      session,
      messageId,
    );
    if (confirmation) {
      let response =
        "The pending Send is cancelled. Your private draft is retained.";
      if (confirmation.answer === "yes") {
        const result = confirmation.replay
          ? await withAccess(pool, session, { kind: "patient" }, async (a) => {
              const row = (
                await a.tx.query(
                  "select * from mhistree.chat_care_proposals where id=$1",
                  [confirmation.proposalId],
                )
              ).rows[0];
              return decoratedProposal(a, row);
            })
          : await confirmCareMessages(
              pool,
              session,
              confirmation.proposalId,
              confirmation.version,
            );
        const stored =
          result?.deliveries?.filter((d) => d.state === "stored").length ?? 0;
        const failed =
          result?.deliveries?.filter((d) => d.state !== "stored").length ?? 0;
        response = stored
          ? `Your message was saved to ${stored} care ${stored === 1 ? "inbox" : "inboxes"}.${failed ? ` ${failed} destination${failed === 1 ? " was" : "s were"} not saved; review the retained draft and retry those explicitly.` : ""} This does not mean a practitioner has read it.`
          : "The message could not be saved to the selected recipients. Your private draft is retained for review.";
      }
      return withAccess(pool, session, { kind: "patient" }, async (a) => {
        const done = await a.tx.query(
          "update mhistree.chat_generations set state='succeeded',lease_until=null,updated_at=clock_timestamp() where message_id=$1 and lease_id=$2 and state='running' returning message_id",
          [messageId, lease],
        );
        if (!done.rowCount) return { state: "cancelled" };
        await a.tx.query(
          "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,reply_to) values($1,$2,$3,$4,'assistant',$5,$6,$7)",
          [
            randomUUID(),
            prepared.message.conversation_id,
            a.actor.personId,
            a.actor.accountId,
            response,
            prepared.message.timezone,
            messageId,
          ],
        );
        return { state: "succeeded" };
      });
    }
    const now = new Date();
    const memory = await recallMemory(
      pool,
      session,
      prepared.message.conversation_id,
      prepared.message.content,
      prepared.history.map((m) => m.id),
    );
    const currentTime = timeAnchor(now, prepared.message.timezone, now);
    const history = boundedHistory(prepared.history);
    const plan = contextPlan(prepared.message.content, history);
    // Navigation starts a fresh bounded health overview, even for a greeting.
    if (prepared.initial) {
      plan.timeline = true;
      plan.broad = true;
    }
    const acceptedContact = contactOfferAccepted(
      history,
      prepared.message.content,
    );
    const latestCare = await withAccess(
      pool,
      session,
      { kind: "patient" },
      (a) => latestCareProposal(a, prepared.message.conversation_id),
    );
    const recovery = careDraftRecovery(prepared.message.content);
    const recoverMissingDraft =
      recovery &&
      !latestCare &&
      previouslyRequestedCare(history, prepared.message.content);
    const previousQuestion = [...history]
      .reverse()
      .find((m) => m.role === "assistant")?.dialogue?.question;
    const needsContact =
      plan.contact ||
      acceptedContact ||
      recoverMissingDraft ||
      (plan.medication &&
        previousQuestion?.kind === "symptom" &&
        /^(yes|yeah|yep)[.! ]*$/i.test(prepared.message.content.trim()));
    const messages: AIMessage[] = history.map((m) => ({
      role: m.role === "patient" ? "user" : "assistant",
      content: m.role === "patient" ? m.content : replyText(m.content),
    }));
    const readEvidence = (a?: AccessTransaction) =>
      plan.timeline
        ? (a
            ? retrieveEvidenceInAccess.bind(null, a)
            : retrieveEvidence.bind(null, pool, session, { kind: "patient" }))(
            prepared.personId,
            [
              plan.searchText,
              ...memory.items
                .filter((i) => i.kind === "patient-report")
                .slice(0, 2)
                .map((i) => i.text),
            ]
              .join(" ")
              .slice(0, 10000),
            {
              selective: true,
              broad: plan.broad,
              timezone: prepared.message.timezone,
              now,
            },
          )
        : Promise.resolve({
            evidence: [],
            gaps: [],
            bounded: true,
            asOf: now.toISOString(),
          });
    const evidence = await readEvidence();
    const safety =
      plan.medication || prepared.initial
        ? await medicationSafetyContext(pool, session, prepared.personId)
        : { items: [], bounded: false, incomplete: true };
    const discovery = needsContact
      ? await practitionerDiscovery(pool, session)
      : { status: "unavailable" as const };
    const bookingOptions: CareOptions =
      /\b(appointment|book|booking|schedule|visit)\b/i.test(
        prepared.message.content,
      )
        ? await appointmentDiscovery(pool, session)
        : { status: "unavailable", recipients: [], slots: [], bounded: false };
    const recommendations = await withAccess(
      pool,
      session,
      { kind: "patient" },
      (a) => pendingRecommendations(a, prepared.message.timezone),
    );
    const system = `${patientChatPolicy}\n${careActionPolicy}\n${continuityPolicy}\nCurrent authorized context for grounded recall (bounded; identifiers/source lineage are internal only and must not appear in the conversational reply): ${JSON.stringify(
      {
        currentTime,
        profile: { name: profile.name, birthDate: profile.birthDate },
        privateMemory: {
          items: (continueWithoutMemory ? [] : memory.items).map((i) => ({
            kind: i.kind,
            text: i.text,
            dates: i.sources.map((s) => ({
              at: s.capturedAt,
              zone: s.timezone,
            })),
          })),
        },
        sourceDates: history.map((m, index) => ({
          index,
          at: m.captured_at,
          zone: m.timezone,
        })),
        limitedMemory: continueWithoutMemory,
        ...evidence,
        evidence: evidence.evidence.map((e) => ({
          text: e.text,
          category: e.category,
          status: e.status,
          eventTime: e.eventTime,
          capturedAt: e.capturedAt,
          timezone: e.sourceTimezone,
          relevance: e.relevance,
          latestEpisodeReport: e.latestEpisodeReport,
        })),
        ...discovery,
        personalMedication: plan.personalMedication,
        medicationSafety: safety,
        medicationRecommendations: recommendations.items,
        recommendationPolicy:
          "Recommendations and plans never prove actual use. Do not initiate medication follow-ups yourself; the server adds one exact eligible question and records its delivery. Never interpret a practitioner yes as patient use.",
        contactPreparationAccepted: acceptedContact,
        careWorkflowState: latestCare
          ? {
              kind: latestCare.kind,
              state: latestCare.state,
              deliveries: latestCare.deliveries?.map((d) => ({
                state: d.state,
              })),
              meaning:
                "Only these stored receipts establish a send. Pending drafts are private and unsent.",
            }
          : {
              state: "none",
              meaning:
                "No saved proposal exists. Do not claim a draft or send exists.",
            },
        previousQuestion,
        appointmentRecipients: bookingOptions.recipients,
        appointmentDiscoveryStatus: bookingOptions.status,
        careActionResults: history
          .filter((m) => m.care_outcome?.state === "completed")
          .slice(-4)
          .map((m) => ({
            ...m.care_outcome,
            reviewedText: m.care_outcome.reviewedText?.slice(0, 1000),
            meaning:
              m.care_outcome.kind === "message"
                ? "Saved to Care inbox; reading or response not established"
                : "Appointment requested; acceptance not established",
          })),
      },
    )}`;
    // The optional method keeps older text-only adapters compatible, without provider fallback.
    const generated = gateway.patientReply
      ? await gateway.patientReply(system, messages, signal)
      : {
          text: await gateway.generate(system, messages, {
            signal,
            maxOutputTokens: 1024,
          }),
          action: null,
        };
    const dialogue = replyDialogue(generated, plan.timeline);
    const uncertainName =
      plan.medication &&
      unresolvedMedicineName(history, prepared.message.content);
    let reply = conversationalHealthText(
      generated.text,
      plan.personalMedication,
      evidence.evidence.length > 0 || memory.items.length > 0,
      dialogue.decision === "urgent",
      prepared.message.content,
      evidence.evidence.some((e) => /dry throat/i.test(e.text)) ||
        memory.items.some(
          (i) => i.kind === "patient-report" && /dry throat/i.test(i.text),
        ),
      uncertainName,
    );
    if (dialogue.decision !== "urgent" && plan.personalMedication)
      dialogue.decision = "clinical_review";
    if (
      dialogue.decision !== "urgent" &&
      (uncertainMedicineName(prepared.message.content) ||
        (uncertainName && reply.includes("confirm its exact name")))
    ) {
      dialogue.decision = "clarification";
      dialogue.question = { kind: "other", subject: "exact medicine name" };
    }
    const action = requestedCareAction(
      generated,
      prepared.message.content,
      acceptedContact || recoverMissingDraft,
    );
    // Reopening a saved draft never creates another proposal or repeats a stored send.
    if (recovery && latestCare && dialogue.decision !== "urgent") {
      if (latestCare.state === "completed") {
        reply =
          latestCare.kind === "message"
            ? "Your message is already saved to Care inbox. That does not mean it has been read. You can check Care inbox for the saved copy."
            : "Your appointment request is already saved. Practitioner acceptance is separate; check Appointments for its status.";
      } else if (latestCare.state === "dismissed") {
        reply =
          "That draft was dismissed. No additional message has been sent. Ask me to prepare a new message if you want a new review.";
      } else if (latestCare.state === "sending") {
        reply =
          "Delivery is still being checked. Review the draft and delivery results below before retrying; no additional message has been sent by this reply.";
      } else if (latestCare.kind === "appointment") {
        reply =
          "Your saved appointment request draft is shown below. Review the recipient and available times, then use Request appointment. No appointment has been requested by this reply.";
      } else {
        const stored =
          latestCare.deliveries?.filter((d) => d.state === "stored").length ??
          0;
        reply = stored
          ? "Your saved draft and delivery results are shown below. Some copies were saved to Care inbox; review the remaining destinations before retrying."
          : "Your saved draft is shown below. Review its text and recipients, then use Send message. Nothing has been sent from this draft.";
      }
      dialogue.question = { kind: "none", subject: "" };
    }
    const proposalAction = recovery && latestCare ? null : action;
    if (
      proposalAction?.kind === "message" &&
      dialogue.decision !== "urgent" &&
      (acceptedContact ||
        recoverMissingDraft ||
        !generated.action ||
        claimsCareOperation(reply))
    ) {
      reply =
        discovery.status === "available" &&
        discovery.connectedPractitioners.length
          ? "I've put together a question for you to review below. You can edit it and choose which practitioners to send it to."
          : "Your private question is drafted for review. We still need to verify an eligible connected recipient before it can be sent.";
      dialogue.question = { kind: "none", subject: "" };
      dialogue.decision = "clinical_review";
    }
    if (
      proposalAction?.kind === "appointment" &&
      dialogue.decision !== "urgent"
    ) {
      reply =
        "Review the appointment request below and choose an eligible recipient and advertised time. No appointment has been requested or booked yet.";
      dialogue.question = { kind: "none", subject: "" };
    }
    if (
      !proposalAction &&
      dialogue.decision !== "urgent" &&
      !(recovery && latestCare) &&
      claimsCareOperation(reply)
    ) {
      reply =
        latestCare &&
        ["draft", "partial", "failed", "sending"].includes(latestCare.state)
          ? "Your saved draft and any delivery results are shown below. Review them and use the card's Send message button to confirm any remaining delivery."
          : "I haven't prepared or sent a new care message. Would you like me to prepare a message for you to review?";
      dialogue.question = {
        kind: latestCare ? "none" : "offer_contact",
        subject: "care message preparation",
      };
    }
    if (dialogue.decision === "urgent" && claimsCareOperation(reply)) {
      // Preserve urgent advice while removing unsupported workflow assertions.
      const advice = reply
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !claimsCareOperation(sentence))
        .join(" ");
      reply = `${advice || "Seek urgent real-world medical help now if you may be in immediate danger."} No care message has been sent by this reply.`;
      dialogue.question = { kind: "none", subject: "" };
    }
    const draftText = groundedContactDraft(
      history,
      prepared.message.content,
      generated.sourceQuotes ?? [],
    );
    const messageOptions: CareOptions =
      discovery.status === "available"
        ? {
            status: "available",
            recipients: discovery.connectedPractitioners,
            slots: [],
            bounded: discovery.bounded,
          }
        : { status: "unavailable", recipients: [], slots: [], bounded: false };
    if (!reply) throw new DomainError("PROVIDER_UNAVAILABLE");
    const currentMemory = await recallMemory(
      pool,
      session,
      prepared.message.conversation_id,
      prepared.message.content,
      prepared.history.map((m) => m.id),
    );
    if (currentMemory.fingerprint !== memory.fingerprint)
      throw new DomainError("ACCESS_REVOKED");
    const currentEvidence = await readEvidence();
    const currentSafety =
      plan.medication || prepared.initial
        ? await medicationSafetyContext(pool, session, prepared.personId)
        : safety;
    if (JSON.stringify(currentSafety) !== JSON.stringify(safety))
      throw new DomainError("ACCESS_REVOKED");
    const currentIds = new Set(currentEvidence.evidence.map((e) => e.id));
    if (evidence.evidence.some((e) => !currentIds.has(e.id)))
      throw new DomainError("ACCESS_REVOKED");
    if (
      JSON.stringify(currentEvidence.evidence) !==
      JSON.stringify(evidence.evidence)
    )
      throw new DomainError("VERSION_CONFLICT");
    if (
      discovery.status === "available" &&
      discovery.connectedPractitioners.length
    ) {
      const currentDiscovery = await practitionerDiscovery(pool, session);
      if (
        currentDiscovery.status !== "available" ||
        JSON.stringify(currentDiscovery) !== JSON.stringify(discovery)
      )
        throw new DomainError("ACCESS_REVOKED");
    }
    if (action?.kind === "appointment" && bookingOptions.recipients.length) {
      const currentBooking = await appointmentDiscovery(pool, session);
      if (
        currentBooking.status !== "available" ||
        JSON.stringify(currentBooking.recipients) !==
          JSON.stringify(bookingOptions.recipients)
      )
        throw new DomainError("ACCESS_REVOKED");
    }
    if (signal?.aborted) throw new DomainError("PROVIDER_UNAVAILABLE");
    const result = await withAccess(
      pool,
      session,
      { kind: "patient" },
      async (a) => {
        const publicationEvidence = await readEvidence(a);
        if (
          JSON.stringify(publicationEvidence.evidence) !==
          JSON.stringify(evidence.evidence)
        )
          throw new DomainError("VERSION_CONFLICT");
        const publicationMemory = await recallMemoryInAccess(
          a,
          prepared.message.conversation_id,
          prepared.message.content,
          prepared.history.map((m) => m.id),
        );
        if (publicationMemory.fingerprint !== memory.fingerprint)
          throw new DomainError("ACCESS_REVOKED");
        const publicationCare = await latestCareProposal(
          a,
          prepared.message.conversation_id,
        );
        if (
          publicationCare?.id !== latestCare?.id ||
          publicationCare?.version !== latestCare?.version ||
          publicationCare?.state !== latestCare?.state ||
          JSON.stringify(publicationCare?.deliveries) !==
            JSON.stringify(latestCare?.deliveries)
        )
          throw new DomainError("VERSION_CONFLICT");
        const done = await a.tx.query(
          "update mhistree.chat_generations set state='succeeded',lease_until=null,updated_at=clock_timestamp() where message_id=$1 and lease_id=$2 and state='running' returning message_id",
          [messageId, lease],
        );
        if (!done.rowCount) return { state: "cancelled" };
        await a.tx.query(
          "select pg_advisory_xact_lock(hashtextextended($1,0))",
          [`medication-workflow:${a.actor.personId}`],
        );
        const freshRecommendations = await pendingRecommendations(
          a,
          prepared.message.timezone,
        );
        if (
          JSON.stringify(freshRecommendations.items) !==
          JSON.stringify(recommendations.items)
        )
          throw new DomainError("VERSION_CONFLICT");
        const followup =
          dialogue.decision !== "urgent" &&
          !proposalAction &&
          plan.medication &&
          !reply.includes("?")
            ? freshRecommendations.due.find((r) =>
                prepared.message.content
                  .toLowerCase()
                  .includes(r.name.toLowerCase()),
              )
            : undefined;
        const question = followup ? medicationQuestion(followup) : null;
        if (question) reply += ` ${question}`;
        const replyId = randomUUID();
        await a.tx.query(
          "insert into mhistree.chat_messages(id,conversation_id,person_id,account_id,role,content,timezone,reply_to,dialogue) values($1,$2,$3,$4,'assistant',$5,$6,$7,$8)",
          [
            replyId,
            prepared.message.conversation_id,
            a.actor.personId,
            a.actor.accountId,
            reply,
            prepared.message.timezone,
            messageId,
            dialogue,
          ],
        );
        if (followup && question)
          await a.tx.query(
            "insert into mhistree.medication_followups(recommendation_id,local_date,reply_message_id,question) values($1,$2,$3,$4) on conflict do nothing",
            [followup.id, freshRecommendations.day, replyId, question],
          );
        if (proposalAction)
          await storeCareProposal(
            a,
            replyId,
            proposalAction,
            proposalAction.kind === "message" ? messageOptions : bookingOptions,
            prepared.message.content,
            draftText,
          );
        return { state: "succeeded" };
      },
      async (tx, actor) => {
        const current = await patientIdentity(tx, actor);
        if (JSON.stringify(current) !== JSON.stringify(profile))
          throw new DomainError("VERSION_CONFLICT");
      },
    );
    aiDebug("chat.reply.published", {
      state: result.state,
      outputCharacters: reply.length,
    });
    return result;
  } catch (error) {
    // No generated content is published after session retirement. Expired leases permit later authorized retry.
    try {
      await withAccess(pool, session, { kind: "patient" }, (a) =>
        a.tx.query(
          "update mhistree.chat_generations set state='failed',error_code=$3,lease_until=null,updated_at=clock_timestamp() where message_id=$1 and lease_id=$2 and state='running'",
          [messageId, lease, applicationErrorCode(error)],
        ),
      );
    } catch {}
    throw error;
  }
}
export async function cancelReply(
  pool: Pool,
  session: string,
  messageId: string,
) {
  z.uuid().parse(messageId);
  return withAccess(pool, session, { kind: "patient" }, async (a) => {
    const result = await a.tx.query(
      "update mhistree.chat_generations set state='cancelled',lease_until=null where message_id=$1 and state in ('queued','running','failed') returning message_id",
      [messageId],
    );
    return { cancelled: Boolean(result.rowCount) };
  });
}
