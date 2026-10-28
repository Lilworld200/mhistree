"use client";
import { useState } from "react";
import { Btn } from "@/components/ui/button";
import {
  EventTime,
  recordLabels,
} from "@/features/health-records/timeline-view";
import { proposalDestinations, type PractitionerProposal } from "./ai-proposal";
export function ProposalReview({
  proposal,
  busy,
  onSave,
}: {
  proposal: PractitionerProposal;
  busy: boolean;
  onSave: (destination: "record" | "note", text: string) => void;
}) {
  const [text, setText] = useState(proposal.body.text);
  return (
    <section
      className="patient-ai-review"
      aria-label={`Review ${recordLabels[proposal.category]}`}
    >
      <h4>{recordLabels[proposal.category]}</h4>
      <label>
        Review or edit this entry
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={10000}
          disabled={busy}
        />
      </label>
      <p>
        <EventTime time={proposal.occurredAt} /> · Status: {proposal.status}
      </p>
      {proposal.medicationDetails && (
        <dl>
          {Object.entries(proposal.medicationDetails).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value ?? "Clarification needed"}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>Suspected findings remain labeled suspected in the reviewed text.</p>
      {proposal.body.medication && (
        <p>
          Medication use: {proposal.body.medication.useStatus}.
          {[
            ["Planned start", proposal.body.medication.plannedStart],
            ["Planned end", proposal.body.medication.plannedEnd],
            ["Started", proposal.body.medication.actualStart],
            ["Stopped", proposal.body.medication.actualEnd],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <span key={label}>
                {" "}
                {label}: {value}.
              </span>
            ))}
        </p>
      )}
      {proposal.missingDetails.length > 0 && (
        <div role="status">
          <p>Clarification needed before adding to the patient record:</p>
          <ul>
            {proposal.missingDetails.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
          <p>Reply below with the details, or keep this as a private note.</p>
        </div>
      )}
      <details>
        <summary>Practitioner source</summary>
        {proposal.sourceSpans.map((span, i) => (
          <blockquote key={i}>{span}</blockquote>
        ))}
      </details>
      <p>
        Saving to the record confirms your review and attributes the entry to
        you. A private note stays out of the patient&apos;s timeline and Health.
      </p>
      <div className="patient-ai-review-actions">
        <Btn
          disabled={busy || !text.trim() || proposal.missingDetails.length > 0}
          onClick={() => onSave("record", text)}
        >
          Add to patient record · {proposalDestinations[proposal.category]}
        </Btn>
        <Btn
          disabled={busy || !text.trim()}
          onClick={() => onSave("note", text)}
        >
          Save private note
        </Btn>
      </div>
    </section>
  );
}
