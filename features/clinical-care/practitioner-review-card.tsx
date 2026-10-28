"use client";
import { useId, useState } from "react";
import { Btn } from "@/components/ui/button";
import { CareRecordFields } from "./care-record-fields";
import {
  careNoteCategories,
  careNoteFields,
  careNoteInput,
  type CareNoteFields,
} from "./care-note-schema";
import type { PractitionerProposal } from "./ai-proposal";
import { EventTime } from "@/features/health-records/timeline-view";

export function proposalFields(p: PractitionerProposal): CareNoteFields {
  const details = p.body.careDetails ?? {};
  return careNoteFields.parse({
    ...details,
    name:
      p.medicationDetails?.name ??
      details.name ??
      (!["clinical", "medication-use", "prescription"].includes(p.category) &&
      p.body.text.length <= 200
        ? p.body.text
        : ""),
    dose: p.medicationDetails?.dose ?? details.dose ?? "",
    frequency: p.medicationDetails?.frequency ?? details.frequency ?? "",
    content: p.category === "clinical" ? p.body.text : "",
    bodySite: p.body.bodySite ?? "",
    status: p.status,
    ...(p.body.medication
      ? {
          useStatus: p.body.medication.useStatus,
          actualStart: p.body.medication.actualStart ?? "",
          actualEnd: p.body.medication.actualEnd ?? "",
        }
      : {}),
  });
}
export type ReviewVersion = { id: string; text: string; expiresAt: string };
export type ReviewEdits = {
  destination: "note" | "record";
  items: { id: string; fields: CareNoteFields }[];
  timezone: string;
};
export type PendingPractitionerDraft = Omit<ReviewEdits, "timezone"> & {
  runId: string;
  version: ReviewVersion | null;
};

export function PractitionerReviewCard({
  proposals,
  busy,
  onPrepare,
  onChange,
  version,
  onConfirm,
  initialDraft,
}: {
  proposals: PractitionerProposal[];
  busy: boolean;
  version: ReviewVersion | null;
  onPrepare: (edits: ReviewEdits) => void;
  onChange: () => void;
  onConfirm: () => void;
  initialDraft?: PendingPractitionerDraft | null;
}) {
  const [destination, setDestination] = useState<"note" | "record">(
      initialDraft?.destination ?? "record",
    ),
    [items, setItems] = useState(() =>
      proposals.map((p) => ({
        id: p.id,
        fields:
          initialDraft?.destination === "record"
            ? (initialDraft.items.find((i) => i.id === p.id)?.fields ??
              proposalFields(p))
            : proposalFields(p),
        privateContent:
          initialDraft?.destination === "note"
            ? (initialDraft.items.find((i) => i.id === p.id)?.fields.content ??
              p.body.text)
            : p.body.text,
        included: initialDraft
          ? initialDraft.items.some((i) => i.id === p.id)
          : true,
      })),
    ),
    [reviewed, setReviewed] = useState(Boolean(initialDraft?.version)),
    [error, setError] = useState("");
  const group = useId();
  function change() {
    setReviewed(false);
    setError("");
    onChange();
  }
  function prepare(edits: ReviewEdits) {
    const errors = edits.items.flatMap((item) => {
      const proposal = proposals.find((p) => p.id === item.id)!;
      const parsed = careNoteInput.safeParse({
        requestKey: item.id,
        patientPersonId: "00000000-0000-4000-8000-000000000001",
        category: proposal.category,
        fields: item.fields,
        destination: edits.destination,
        timezone: edits.timezone,
        reviewed: true,
      });
      return parsed.success
        ? []
        : parsed.error.issues.map(
            (i) => `${careNoteCategories[proposal.category]}: ${i.message}`,
          );
    });
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    onPrepare(edits);
  }
  return (
    <section
      className="patient-ai-review account-form practitioner-finding-card"
      aria-label="Review findings"
    >
      <h3>Review findings</h3>
      <p>
        Prefilled from your description. Complete or correct the fields, or
        continue typing below.
      </p>
      <fieldset className="care-note-destinations" disabled={busy}>
        <legend>Save these findings as</legend>
        {(
          [
            ["note", "Private Note"],
            ["record", "Patient Record"],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            data-selected={destination === value}
            className={
              destination === value
                ? "care-note-destination is-selected"
                : "care-note-destination"
            }
            style={{ opacity: destination === value ? 1 : 0.55 }}
          >
            <input
              type="radio"
              name={group}
              value={value}
              checked={destination === value}
              onChange={() => {
                setDestination(value);
                change();
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {items.map((item, index) => {
        const p = proposals[index];
        return (
          <fieldset key={item.id} disabled={busy}>
            <legend>{careNoteCategories[p.category]}</legend>
            <label className="care-note-review">
              <input
                type="checkbox"
                checked={item.included}
                onChange={(e) => {
                  setItems((old) =>
                    old.map((i) =>
                      i.id === item.id
                        ? { ...i, included: e.target.checked }
                        : i,
                    ),
                  );
                  change();
                }}
              />
              Include this finding
            </label>
            {item.included && (
              <>
                {destination === "record" ? (
                  <CareRecordFields
                    category={p.category}
                    fields={item.fields}
                    setField={(key, value) => {
                      setItems((old) =>
                        old.map((i) => {
                          if (i.id !== item.id) return i;
                          const fields = { ...i.fields, [key]: value };
                          if (key === "useStatus") {
                            if (value !== "stopped") fields.actualEnd = "";
                            if (!["taking", "stopped"].includes(value))
                              fields.actualStart = "";
                          }
                          return { ...i, fields };
                        }),
                      );
                      change();
                    }}
                  />
                ) : (
                  <label>
                    Private note
                    <textarea
                      value={item.privateContent}
                      maxLength={8000}
                      onChange={(e) => {
                        setItems((old) =>
                          old.map((i) =>
                            i.id === item.id
                              ? {
                                  ...i,
                                  privateContent: e.target.value,
                                }
                              : i,
                          ),
                        );
                        change();
                      }}
                    />
                  </label>
                )}
                <details>
                  <summary>Your original description</summary>
                  <p>
                    Original event timing: <EventTime time={p.occurredAt} />. An
                    entered event date replaces this timing.
                  </p>
                  {p.sourceSpans.map((text, i) => (
                    <blockquote key={i}>{text}</blockquote>
                  ))}
                </details>
              </>
            )}
          </fieldset>
        );
      })}
      <label className="care-note-review">
        <input
          type="checkbox"
          checked={reviewed}
          disabled={busy}
          onChange={(e) => {
            setReviewed(e.target.checked);
            onChange();
          }}
        />
        I reviewed the included findings and their destination.
      </label>
      {!version ? (
        <Btn
          disabled={busy || !reviewed || !items.some((i) => i.included)}
          onClick={() =>
            prepare({
              destination,
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              items: items
                .filter((i) => i.included)
                .map(({ id, fields, privateContent }) => ({
                  id,
                  fields:
                    destination === "note"
                      ? {
                          ...fields,
                          content: privateContent,
                        }
                      : fields,
                })),
            })
          }
        >
          Review message
        </Btn>
      ) : (
        <div className="care-note-preview">
          <h4>Your message</h4>
          <p className="care-note-text">{version.text}</p>
          <p>
            Send this reviewed message and{" "}
            {destination === "note"
              ? "save your private notes"
              : "save these findings to the patient record"}
            ? You can click Send or reply “okay” below.
          </p>
          <Btn kind="dark" disabled={busy} onClick={onConfirm}>
            Send reviewed message
          </Btn>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
