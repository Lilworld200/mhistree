"use client";
import { useId, useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import type { ActingContext } from "@/features/access/server";
import {
  careNoteCategories,
  careNoteFields,
  careNoteBody,
  careNoteInput,
  type CareNoteCategory,
  type CareNoteFields,
} from "./care-note-schema";

type SavedNote = {
  id: string;
  category: string;
  body: { text: string };
  version: number;
  state: string;
  created_at: string;
  updated_at: string;
};
type NotesPage = { items: SavedNote[]; nextCursor: string | null };
export function CareNotesView({
  connectionId,
  organizationContext,
  patientPersonId,
  writableCategories,
  onSaved,
  onDenied,
}: {
  connectionId: string;
  organizationContext?: ActingContext;
  patientPersonId: string;
  writableCategories: string[];
  onSaved: () => void | Promise<void>;
  onDenied?: () => void;
}) {
  const [destination, setDestination] = useState<"note" | "record">("note");
  const categories = (
    Object.keys(careNoteCategories) as CareNoteCategory[]
  ).filter((c) => writableCategories.includes(c));
  const [noteCategory, setNoteCategory] = useState<CareNoteCategory>(
      categories[0] ?? "clinical",
    ),
    [recordCategory, setRecordCategory] = useState<CareNoteCategory>(
      categories[0] ?? "clinical",
    );
  const [note, setNote] = useState(() => careNoteFields.parse({})),
    [records, setRecords] = useState<
      Partial<Record<CareNoteCategory, CareNoteFields>>
    >({});
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false),
    [notes, setNotes] = useState<NotesPage>({ items: [], nextCursor: null }),
    [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<SavedNote | null>(null),
    [editText, setEditText] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null),
    locked = useRef(false),
    historyRequest = useRef(0);
  const endpoint = organizationContext
    ? "/api/organizations/workspace"
    : "/api/practitioner/workspace";
  const binding = organizationContext
    ? { context: organizationContext }
    : { connectionId };
  const query = organizationContext
    ? `context=${encodeURIComponent(JSON.stringify(organizationContext))}`
    : `connection=${connectionId}`;
  const category = destination === "note" ? noteCategory : recordCategory;
  const fields =
    destination === "note"
      ? note
      : (records[category] ?? careNoteFields.parse({}));
  const setField = (key: keyof CareNoteFields, value: string) => {
    setError("");
    setNotice("");
    setReviewed(false);
    if (destination === "note") setNote((old) => ({ ...old, [key]: value }));
    else
      setRecords((old) => {
        const next = {
          ...(old[category] ?? careNoteFields.parse({})),
          [key]: value,
        };
        if (key === "useStatus") {
          if (value !== "stopped") next.actualEnd = "";
          if (!["taking", "stopped"].includes(value)) next.actualStart = "";
        }
        return { ...old, [category]: next };
      });
  };
  function failed(e: unknown) {
    setError(errorMessage(e));
    if (
      e instanceof Error &&
      [
        "ACCESS_DENIED",
        "ACCESS_REVOKED",
        "AUTH_REQUIRED",
        "SESSION_RETIRED",
      ].includes(e.message)
    ) {
      setNotes({ items: [], nextCursor: null });
      setEditing(null);
      onDenied?.();
    }
  }
  async function loadNotes(before?: string) {
    const generation = ++historyRequest.current;
    setLoading(true);
    setError("");
    try {
      const page = await api<NotesPage>(
        `${endpoint}?${query}&view=private-notes${before ? `&cursor=${encodeURIComponent(before)}` : ""}`,
      );
      if (historyRequest.current === generation)
        setNotes((old) =>
          before
            ? {
                items: [...old.items, ...page.items],
                nextCursor: page.nextCursor,
              }
            : page,
        );
    } catch (e) {
      failed(e);
    } finally {
      if (historyRequest.current === generation) setLoading(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    setError("");
    setNotice("");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const fingerprint = JSON.stringify({
      patientPersonId,
      destination,
      category,
      fields,
      timezone,
      reviewed,
    });
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const parsed = careNoteInput.safeParse({
      requestKey: pending.current.key,
      patientPersonId,
      destination,
      category,
      fields,
      timezone,
      reviewed: destination === "record" ? reviewed : false,
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    locked.current = true;
    setBusy(true);
    try {
      await api(endpoint, {
        ...binding,
        action: "save-note",
        data: parsed.data,
      });
      pending.current = null;
      setNotice(
        destination === "note"
          ? "Private note saved. Only you can view it."
          : "Patient record saved to the timeline and relevant Health section.",
      );
      if (destination === "note") setNote(careNoteFields.parse({}));
      else
        setRecords((old) => ({ ...old, [category]: careNoteFields.parse({}) }));
      setReviewed(false);
      await onSaved();
    } catch (cause) {
      failed(cause);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function updateNote(action: "edit" | "resume" | "cancel") {
    if (!editing || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await api(endpoint, {
        ...binding,
        action: "edit",
        data: {
          id: editing.id,
          version: editing.version,
          action,
          ...(action === "edit"
            ? { body: { ...editing.body, text: editText } }
            : {
                reason:
                  action === "resume"
                    ? editText
                    : "Author archived this private note.",
              }),
        },
      });
      setEditing(null);
      await loadNotes();
      await onSaved();
    } catch (e) {
      failed(e);
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
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
  const previewInput =
    destination === "record"
      ? careNoteInput.safeParse({
          requestKey: pending.current?.key ?? crypto.randomUUID(),
          patientPersonId,
          destination,
          category,
          fields,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          reviewed: true,
        })
      : null;
  const preview = previewInput?.success
    ? careNoteBody(previewInput.data).text
    : "";
  const allowed = categories.includes(category);
  const destinationName = useId();
  return (
    <section className="care-notes-editor" aria-label="Care notes">
      <fieldset
        className="care-note-destinations"
        aria-label="Care note destination"
        disabled={busy}
      >
        {(
          [
            ["note", "Private Note"],
            ["record", "Patient Record"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} data-selected={destination === value}>
            <input
              type="radio"
              name={destinationName}
              value={value}
              checked={destination === value}
              onChange={() => {
                setDestination(value);
                setHistoryOpen(false);
                setEditing(null);
                setReviewed(false);
                setError("");
                setNotice("");
              }}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="care-note-help">
        {destination === "note"
          ? "For your own care notes. These stay private and do not appear in the patient's timeline or Health."
          : "Record care you have reviewed. The patient and currently authorised care team can see this entry."}
      </p>
      {destination === "note" && (
        <Btn
          sm
          disabled={busy || loading}
          onClick={() => {
            setHistoryOpen((v) => !v);
            setEditing(null);
            if (!historyOpen) void loadNotes();
          }}
        >
          {historyOpen ? "New private note" : "Previous private notes"}
        </Btn>
      )}
      {historyOpen ? (
        <section
          className="care-note-history"
          aria-label="Previous private notes"
        >
          <h3>Previous private notes</h3>
          {loading && <p role="status">Loading your private notes…</p>}
          {!loading && !notes.items.length && !error && (
            <p>No private notes saved for this patient yet.</p>
          )}
          {notes.items.map((n) => (
            <article key={n.id} className="record-card">
              <h4>
                {careNoteCategories[n.category as CareNoteCategory] ??
                  "Private note"}
              </h4>
              <small>
                {new Date(n.created_at).toLocaleString()} ·{" "}
                {n.state === "cancelled"
                  ? "Archived"
                  : n.state === "paused"
                    ? "Access paused"
                    : "Private"}
              </small>
              <p className="care-note-text">{n.body.text}</p>
              {n.state !== "cancelled" && (
                <Btn
                  sm
                  disabled={busy}
                  onClick={() => {
                    setEditing(n);
                    setEditText(n.state === "paused" ? "" : n.body.text);
                  }}
                >
                  {n.state === "paused"
                    ? "Review paused note"
                    : "Edit private note"}
                </Btn>
              )}
              {editing?.id === n.id && (
                <div className="account-form">
                  <label>
                    {n.state === "paused"
                      ? "Reason to resume after reviewing current access"
                      : "Edit private note"}
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={8000}
                      minLength={n.state === "paused" ? 10 : 1}
                    />
                  </label>
                  <div className="care-note-actions">
                    <Btn
                      disabled={
                        busy ||
                        editText.trim().length < (n.state === "paused" ? 10 : 1)
                      }
                      onClick={() =>
                        void updateNote(
                          n.state === "paused" ? "resume" : "edit",
                        )
                      }
                    >
                      {n.state === "paused"
                        ? "Review and resume"
                        : "Save Private Note"}
                    </Btn>
                    <Btn disabled={busy} onClick={() => setEditing(null)}>
                      Cancel editing
                    </Btn>
                    <Btn
                      disabled={busy}
                      onClick={() => void updateNote("cancel")}
                    >
                      Archive note
                    </Btn>
                  </div>
                </div>
              )}
            </article>
          ))}
          {notes.nextCursor && (
            <Btn
              disabled={loading}
              onClick={() => void loadNotes(notes.nextCursor!)}
            >
              Load more private notes
            </Btn>
          )}
        </section>
      ) : (
        <form
          className="account-form care-note-form"
          onSubmit={(e) => void submit(e)}
        >
          <fieldset disabled={busy || !categories.length}>
            <label>
              {destination === "note" ? "Note topic" : "Record category"}
              <select
                value={category}
                onChange={(e) => {
                  if (destination === "note")
                    setNoteCategory(e.target.value as CareNoteCategory);
                  else setRecordCategory(e.target.value as CareNoteCategory);
                  setReviewed(false);
                  setError("");
                  setNotice("");
                }}
              >
                {categories.map((c) => (
                  <option value={c} key={c}>
                    {careNoteCategories[c]}
                  </option>
                ))}
              </select>
            </label>
            {destination === "note" ? (
              <>
                {input("title", "Note title (optional)")}
                <label>
                  Private note
                  <textarea
                    value={fields.content}
                    onChange={(e) => setField("content", e.target.value)}
                    required
                    maxLength={8000}
                    rows={6}
                  />
                </label>
              </>
            ) : (
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
                    This records your prescription or recommendation. It does
                    not mean the patient is taking the medicine.
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
                <section
                  className="care-note-preview"
                  aria-label="Patient record preview"
                >
                  <h3>Patient record preview</h3>
                  <p className="care-note-text">
                    {preview ||
                      "Complete the fields above to review this entry."}
                  </p>
                  <label className="care-note-review">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      required
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    I reviewed these details and want to save them to the
                    patient&apos;s record.
                  </label>
                </section>
              </>
            )}
            <Btn kind="dark" type="submit" disabled={busy || !allowed}>
              {busy
                ? "Saving…"
                : destination === "note"
                  ? "Save Private Note"
                  : "Save Patient Record"}
            </Btn>
          </fieldset>
          {!categories.length && (
            <p role="status">
              Your current access does not allow saving care notes or patient
              records.
            </p>
          )}
        </form>
      )}
      {error && (
        <p className="ui-notice" role="alert">
          {error} Your unsaved input is retained.
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
