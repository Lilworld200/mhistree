"use client";
import { useState } from "react";
import Link from "next/link";
import { SidePanel } from "@/components/ui/side-panel";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client-api";
import { category } from "@/features/health-records/schema";
import { categoryLabels } from "@/features/access/sharing-types";
import type {
  DirectPatient,
  PatientCapabilities,
  PatientCandidate,
} from "./patient-types";

export function PatientEntryPanel({
  capabilities,
  rows,
  onClose,
  onConnected,
  returnFocus,
}: {
  capabilities: PatientCapabilities;
  rows: DirectPatient[];
  onClose: () => void;
  onConnected: () => Promise<void>;
  returnFocus: () => HTMLElement | null;
}) {
  const [mode, setMode] = useState<"lookup" | "register">(
      capabilities.lookup ? "lookup" : "register",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [candidates, setCandidates] = useState<PatientCandidate[] | null>(null),
    [selected, setSelected] = useState<
      (PatientCandidate & { requestKey: string }) | null
    >(null);
  const [method, setMethod] = useState("login"),
    [receipt, setReceipt] = useState<{ alias: string } | null>(null);
  return (
    <SidePanel
      title={selected ? "Request a connection" : "Add a patient"}
      description={
        selected
          ? selected.displayName
          : "Find a person by Mhistree ID or register someone without a login."
      }
      onClose={onClose}
      returnFocus={returnFocus}
    >
      <div className="sharing-panel-body practitioner-entry">
        {!selected && (
          <nav className="sharing-tabs" aria-label="Add patient options">
            {capabilities.lookup && (
              <button
                className={`pill ${mode === "lookup" ? "on" : ""}`}
                aria-pressed={mode === "lookup"}
                disabled={busy}
                onClick={() => {
                  setMode("lookup");
                  setError("");
                }}
              >
                Find by ID
              </button>
            )}
            {capabilities.register && (
              <button
                className={`pill ${mode === "register" ? "on" : ""}`}
                aria-pressed={mode === "register"}
                disabled={busy}
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                Register person
              </button>
            )}
          </nav>
        )}
        {selected ? (
          <>
            <button
              className="sharing-text-action"
              onClick={() => {
                setSelected(null);
                setError("");
              }}
              disabled={busy}
            >
              <Icon n="left" />
              Back to lookup
            </button>
            <div className="sharing-callout">
              <Icon n="shield" />
              <p>
                Finding a person does not open their history. Access requires
                patient approval or recorded, identity-checked in-person
                consent.
              </p>
            </div>
            {selected.reviewRequired && (
              <p className="practitioner-warning">
                Provisional identity: resolve any uncertainty before connecting.
                Do not assume this is an existing patient’s record.
              </p>
            )}
            <form
              className="account-form practitioner-panel-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget),
                  categories = fields.getAll("category");
                if (!categories.length) {
                  setError("Choose at least one category to request.");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  await api("/api/practitioner/patients", {
                    action: "connect",
                    data: {
                      patientPersonId: selected.personId,
                      requestKey: selected.requestKey,
                      method,
                      categories,
                      exclusions: [],
                      ...(method === "in-person"
                        ? { evidence: fields.get("evidence") }
                        : {}),
                    },
                  });
                  await onConnected();
                  onClose();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Consent method
                <select
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  disabled={busy}
                >
                  <option value="login">Request patient approval</option>
                  <option value="in-person">Record in-person consent</option>
                </select>
              </label>
              <fieldset disabled={busy}>
                <legend>Requested access</legend>
                <div className="sharing-category-grid">
                  {category.options.map((c) => (
                    <label className="sharing-category" key={c}>
                      <input type="checkbox" name="category" value={c} />
                      <span>{categoryLabels[c]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="sharing-help">
                Unchecked categories, private notes and drafts are excluded from
                shared history.
              </p>
              {method === "in-person" ? (
                <>
                  <label>
                    Identity check and consent evidence
                    <textarea
                      name="evidence"
                      minLength={20}
                      maxLength={2000}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label className="practitioner-confirm">
                    <input type="checkbox" required disabled={busy} />I have
                    checked the person’s identity and recorded their consent to
                    this scope.
                  </label>
                </>
              ) : (
                <p className="sharing-help">
                  The request stays pending until the patient approves it in
                  Sharing.
                </p>
              )}
              <Btn type="submit" kind="dark" disabled={busy}>
                {busy
                  ? "Saving…"
                  : method === "in-person"
                    ? "Record consent and connect"
                    : "Send connection request"}
              </Btn>
            </form>
          </>
        ) : mode === "lookup" && capabilities.lookup ? (
          <>
            <form
              className="practitioner-lookup"
              onSubmit={async (event) => {
                event.preventDefault();
                const fields = new FormData(event.currentTarget);
                setBusy(true);
                setError("");
                setCandidates(null);
                try {
                  setCandidates(
                    await api<PatientCandidate[]>(
                      "/api/practitioner/patients",
                      {
                        action: "lookup",
                        data: { exactAlias: fields.get("alias") },
                      },
                    ),
                  );
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="searchpill">
                <Icon n="search" />
                <span className="sr-only">Mhistree ID</span>
                <input
                  name="alias"
                  placeholder="Enter Mhistree ID"
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </label>
              <Btn type="submit" kind="dark" disabled={busy}>
                {busy ? "Finding…" : "Find person"}
              </Btn>
            </form>
            <p className="sharing-help">
              Lookup reveals identity details only. It grants no access to
              health records.
            </p>
            {candidates?.length === 0 && (
              <div className="sharing-empty">
                <Icon n="search" />
                <h3>No person found</h3>
                <p>Check the Mhistree ID with the patient and try again.</p>
              </div>
            )}
            {candidates?.map((person) => {
              const existing = rows.find(
                (row) =>
                  row.patient_person_id === person.personId &&
                  row.status !== "revoked",
              );
              return (
                <article
                  className="card practitioner-candidate"
                  key={person.personId}
                >
                  <h3>{person.displayName}</h3>
                  {person.reviewRequired && (
                    <p className="sharing-help">
                      Provisional identity · confirmation needed
                    </p>
                  )}
                  {existing ? (
                    <>
                      <p>
                        {existing.status === "active"
                          ? "Already connected"
                          : "Awaiting patient approval"}
                      </p>
                      {existing.status === "active" && (
                        <Btn asChild sm>
                          <Link href={`/clinician/patients/${existing.id}`}>
                            Open patient record
                          </Link>
                        </Btn>
                      )}
                    </>
                  ) : capabilities.connect ? (
                    <Btn
                      sm
                      onClick={() => {
                        setSelected({
                          ...person,
                          requestKey: crypto.randomUUID(),
                        });
                        setMethod("login");
                        setError("");
                      }}
                    >
                      Review connection request
                    </Btn>
                  ) : (
                    <p className="sharing-help">
                      Your professional permissions do not include creating
                      connections.
                    </p>
                  )}
                </article>
              );
            })}
          </>
        ) : capabilities.register ? (
          <>
            {receipt ? (
              <div
                className="card practitioner-registration-receipt"
                role="status"
              >
                <Icon n="check" s={24} />
                <h3>Person registered</h3>
                <p>Mhistree ID</p>
                <strong>{receipt.alias}</strong>
                <p>
                  A login has not been created. This ID locates the person; it
                  does not grant record access.
                </p>
                <Btn onClick={onClose}>Done</Btn>
              </div>
            ) : (
              <>
                <p className="sharing-help">
                  Use known details only. Email, password and a date of birth
                  are not required to create a person’s record.
                </p>
                <form
                  className="account-form practitioner-panel-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const fields = new FormData(event.currentTarget);
                    setBusy(true);
                    setError("");
                    try {
                      setReceipt(
                        await api("/api/practitioner/patients", {
                          action: "register",
                          data: {
                            displayName: fields.get("name"),
                            birthDate: fields.get("birthDate") || null,
                            contacts: [],
                          },
                        }),
                      );
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Known name
                    <input
                      name="name"
                      autoComplete="off"
                      minLength={1}
                      maxLength={200}
                      required
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Date of birth, if known
                    <input name="birthDate" type="date" disabled={busy} />
                  </label>
                  <Btn kind="dark" type="submit" disabled={busy}>
                    {busy ? "Registering…" : "Register person"}
                  </Btn>
                </form>
              </>
            )}
          </>
        ) : (
          <p>
            Patient lookup and registration require additional professional
            permissions.
          </p>
        )}
        {error && (
          <div role="alert" className="sharing-error">
            <p>{error}</p>
            <Btn
              sm
              onClick={() => {
                void onConnected()
                  .then(onClose)
                  .catch((e) => setError(errorMessage(e)));
              }}
            >
              Reload patient list
            </Btn>
          </div>
        )}
      </div>
    </SidePanel>
  );
}
