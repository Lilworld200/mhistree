"use client";
import { TalkAssistant } from "./talk-assistant";
import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client-api";
import { recordLabels } from "@/features/health-records/timeline-view";
import {
  proposalDestinations,
  type PractitionerProposal,
  type PractitionerReply,
} from "@/features/clinical-care/ai-proposal";

import { ProposalReview } from "@/features/clinical-care/proposal-review";

export function LegacyPatientAssistant({
  connectionId,
  summary = false,
  writableCategories = [],
  onSaved,
  onDenied,
  organizationContext,
  captureOnly = false,
  initialQuestion = "",
  originCareMessageId,
}: {
  connectionId: string;
  organizationContext?: import("@/features/access/server").ActingContext;
  captureOnly?: boolean;
  initialQuestion?: string;
  originCareMessageId?: string;
  summary?: boolean;
  writableCategories?: string[];
  onSaved?: () => void;
  onDenied?: () => void;
}) {
  const endpoint = organizationContext
    ? "/api/organizations/workspace"
    : "/api/practitioner/workspace";
  const binding = organizationContext
    ? { context: organizationContext }
    : { connectionId };
  const [question, setQuestion] = useState(initialQuestion),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [turns, setTurns] = useState<
    (PractitionerReply & { question: string })[]
  >([]);
  const [decisions, setDecisions] = useState<Record<string, "record" | "note">>(
    {},
  );
  const inFlight = useRef(false),
    end = useRef<HTMLDivElement | null>(null);
  const latestProposalTurn = turns.findLastIndex(
    (turn) => (turn.proposals?.length ?? 0) > 0,
  );
  const captureCategories = writableCategories.filter(
    (category) => category in proposalDestinations,
  );
  function failed(e: unknown) {
    if (
      e instanceof Error &&
      [
        "ACCESS_DENIED",
        "ACCESS_REVOKED",
        "AUTH_REQUIRED",
        "SESSION_RETIRED",
      ].includes(e.message)
    ) {
      setTurns([]);
      setDecisions({});
      onDenied?.();
    }
    setError(errorMessage(e));
  }
  async function send(text: string, purpose = "question") {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const previousRunId = turns.at(-1)?.id;
      const response = await api<PractitionerReply>(endpoint, {
        ...binding,
        action: "ai",
        data: {
          question: captureOnly
            ? `Prepare an editable patient-record proposal from my following care description. Clarify consequential missing details before publication.\n\n${text}`
            : text,
          purpose,
          includeOwnNotes: false,
          conversation: true,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(previousRunId ? { previousRunId } : {}),
          ...(originCareMessageId ? { originCareMessageId } : {}),
        },
      });
      setTurns((old) => [...old, { question: text, ...response }]);
      setQuestion("");
      end.current?.scrollIntoView?.({ block: "nearest" });
    } catch (e) {
      failed(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function save(
    runId: string,
    proposal: PractitionerProposal,
    destination: "record" | "note",
    text: string,
  ) {
    if (
      inFlight.current ||
      decisions[proposal.id] ||
      !writableCategories.includes(proposal.category)
    )
      return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api(endpoint, {
        ...binding,
        action: "ai-save",
        data: { runId, itemId: proposal.id, destination, reviewed: true, text },
      });
      setDecisions((old) => ({ ...old, [proposal.id]: destination }));
      onSaved?.();
    } catch (e) {
      failed(e);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="patient-assistant">
      <p className="sharing-help">
        {captureCategories.length
          ? "Ask about shared records or describe care to record. Mhistree will clarify details and ask you to review each entry before saving to the timeline and Health, or as an author-only private note. Only your currently permitted categories can be saved."
          : "Read-only assistance: ask about this patient's currently shared records. Your current permissions do not allow saving notes or patient record entries."}
      </p>
      {captureCategories.length > 0 && (
        <p className="sharing-help">
          You can record:{" "}
          {captureCategories
            .map((category) => recordLabels[category] ?? category)
            .join(", ")}
          .
        </p>
      )}
      {summary && (
        <Btn
          icon="spark"
          disabled={busy}
          onClick={() =>
            void send(
              "Summarize this patient's authorized history and persistent health details. Distinguish today's reports from older history, medication use from prescriptions, and preserve uncertainty and dates.",
              "summary",
            )
          }
        >
          Generate AI summary
        </Btn>
      )}
      {!turns.length && !summary && (
        <div className="patient-assistant-empty">
          <Icon n="chat" s={28} />
          <h3>
            {captureCategories.length
              ? "Explore the record or describe care"
              : "Explore the patient's record"}
          </h3>
          <p>
            {captureCategories.length
              ? "Discuss findings, medication use, prescriptions, allergies or ongoing issues, within your permissions."
              : "Ask about reported symptoms, medication history or changes over time."}
          </p>
        </div>
      )}
      <div
        className="patient-assistant-turns"
        aria-label="Talk to Mhistree"
        aria-live="polite"
      >
        {turns.map((turn, index) => (
          <div key={turn.id ?? index}>
            <p className="patient-ai-question">{turn.question}</p>
            <article className="patient-ai-response">
              <small>AI assistance · Human review required</small>
              <p>{turn.text}</p>
              {turn.limitations.map((text, i) => (
                <p className="sharing-help" key={i}>
                  {text}
                </p>
              ))}
              <details>
                <summary>{turn.evidenceIds.length} supporting records</summary>
                <p>
                  {turn.evidenceIds.length
                    ? "Evidence is drawn from the current authorized record. Review the shared history alongside this response."
                    : "No finalized supporting record was cited."}
                </p>
              </details>
            </article>
            {(turn.proposals ?? []).map((proposal) =>
              decisions[proposal.id] ? (
                <p role="status" key={proposal.id}>
                  {decisions[proposal.id] === "note"
                    ? "Saved as your private note. The patient's record was not changed."
                    : `Saved to ${proposalDestinations[proposal.category]}.`}
                </p>
              ) : index === latestProposalTurn &&
                writableCategories.includes(proposal.category) ? (
                <ProposalReview
                  key={proposal.id}
                  proposal={proposal}
                  busy={busy}
                  onSave={(destination, text) =>
                    void save(turn.id, proposal, destination, text)
                  }
                />
              ) : null,
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="patient-ai-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send(question);
        }}
      >
        <label className="sr-only" htmlFor="patient-ai-question">
          Ask about this patient or describe care
        </label>
        <textarea
          id="patient-ai-question"
          placeholder={
            captureCategories.length
              ? "Ask a question or describe care..."
              : "Ask about this patient..."
          }
          value={question}
          maxLength={originCareMessageId ? 10000 : captureOnly ? 2700 : 3000}
          required
          onChange={(e) => setQuestion(e.target.value)}
          disabled={busy}
        />
        <Btn kind="dark" type="submit" disabled={busy || !question.trim()}>
          {busy ? "Working..." : "Send"}
        </Btn>
      </form>
      {error && (
        <p role="alert">
          {error} Your unsaved input has been kept so you can try again.
        </p>
      )}
    </div>
  );
}

export function PatientAssistant(
  props: ComponentProps<typeof LegacyPatientAssistant>,
) {
  return props.captureOnly || props.originCareMessageId ? (
    <LegacyPatientAssistant {...props} />
  ) : (
    <TalkAssistant
      key={JSON.stringify([
        props.organizationContext ?? { connectionId: props.connectionId },
        props.writableCategories ?? [],
      ])}
      {...props}
    />
  );
}
