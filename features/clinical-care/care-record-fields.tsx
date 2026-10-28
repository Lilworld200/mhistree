"use client";
import type { CareNoteCategory, CareNoteFields } from "./care-note-schema";
export function CareRecordFields({
  category,
  fields,
  setField,
}: {
  category: CareNoteCategory;
  fields: CareNoteFields;
  setField: (key: keyof CareNoteFields, value: string) => void;
}) {
  const input = (
    key: keyof CareNoteFields,
    label: string,
    required = false,
    type = "text",
    hint?: string,
  ) => (
    <label key={key}>
      {label}
      <input
        type={type}
        value={fields[key]}
        onChange={(e) => setField(key, e.target.value)}
        required={required}
        maxLength={type === "date" ? undefined : 200}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
  const select = (
    key: keyof CareNoteFields,
    label: string,
    options: readonly (readonly [string, string])[],
    required = false,
  ) => (
    <label key={key}>
      {label}
      <select
        value={fields[key]}
        onChange={(e) => setField(key, e.target.value)}
        required={required}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="care-note-field-grid">
        {["medication-use", "prescription"].includes(category) ? (
          <>
            {input("name", "Medication name", true)}
            {input(
              "dose",
              "Dose",
              true,
              "text",
              "For example: 500 mg per dose. Use the verified medicine details.",
            )}
            {input(
              "frequency",
              "Frequency",
              true,
              "text",
              "For example: twice daily, or the explicit as-needed instructions.",
            )}
            {input("route", "Route (optional)")}
            {category === "medication-use" ? (
              <>
                {select(
                  "useStatus",
                  "Actual medication use",
                  [
                    ["", "Choose use status"],
                    ["taking", "Taking"],
                    ["stopped", "Stopped"],
                    ["not-started", "Not started"],
                    ["unknown", "Use not established"],
                  ],
                  true,
                )}
                {["taking", "stopped"].includes(fields.useStatus) &&
                  input(
                    "actualStart",
                    "Actual start date (if known)",
                    false,
                    "date",
                  )}
                {fields.useStatus === "stopped" &&
                  input(
                    "actualEnd",
                    "Actual stop date (if known)",
                    false,
                    "date",
                  )}
              </>
            ) : (
              <>
                {input(
                  "plannedStart",
                  "Prescribed start date (if known)",
                  false,
                  "date",
                )}
                {input(
                  "plannedEnd",
                  "Prescribed end date (if known)",
                  false,
                  "date",
                )}
              </>
            )}
          </>
        ) : (
          <>
            {category !== "clinical" &&
              input(
                "name",
                category === "ongoing"
                  ? "Condition / issue"
                  : category === "allergy"
                    ? "Allergen / substance"
                    : category === "baseline"
                      ? "Baseline detail"
                      : category === "symptom"
                        ? "Symptom"
                        : "Activity",
                true,
              )}
            {["ongoing", "allergy"].includes(category) &&
              select("certainty", "Certainty", [
                ["suspected", "Suspected / not confirmed"],
                ["confirmed", "Confirmed by practitioner"],
              ])}
            {category === "allergy" && (
              <>
                {input("reaction", "Reaction (if known)")}
                {select("severity", "Reaction severity (if known)", [
                  ["", "Not recorded"],
                  ["unknown", "Unknown"],
                  ["mild", "Mild"],
                  ["moderate", "Moderate"],
                  ["severe", "Severe"],
                ])}
              </>
            )}
            {category === "baseline" && (
              <>
                {input("value", "Usual value / description", true)}
                {input("unit", "Unit (if applicable)")}
              </>
            )}
            {["clinical", "symptom", "ongoing"].includes(category) &&
              input("bodySite", "Body site (if applicable)")}
            {select("status", "Current reported state", [
              ["unknown", "Not established"],
              ["active", "Active / current"],
              ["resolved", "Resolved"],
              ["recurrent", "Recurrent"],
            ])}
          </>
        )}
        {input(
          "eventDate",
          category === "ongoing"
            ? "Onset / event date (if known)"
            : "Event date (if known)",
          false,
          "date",
          "Leave blank when the occurrence date is unknown.",
        )}
      </div>
      {["medication-use", "prescription"].includes(category) && (
        <label>
          What is this medication for? (optional)
          <textarea
            value={fields.indication}
            onChange={(e) => setField("indication", e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Add a short note about why this medication is being used or recommended."
          />
        </label>
      )}
      {category === "prescription" && (
        <p className="care-note-help">
          This records your prescription or recommendation. It does not mean the
          patient is taking the medicine.
        </p>
      )}
      <label>
        {category === "clinical"
          ? "Clinical observation"
          : "Additional details (optional)"}
        <textarea
          value={fields.content}
          onChange={(e) => setField("content", e.target.value)}
          required={category === "clinical"}
          maxLength={8000}
          rows={4}
        />
      </label>
    </>
  );
}
