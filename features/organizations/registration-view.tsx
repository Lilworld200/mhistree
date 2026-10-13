"use client";
import { useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { DuplicateFlagView } from "@/features/identity/duplicates-view";
export function OrganizationRegistration({
  organizationId,
}: {
  organizationId: string;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [patient, setPatient] = useState(""),
    [alias, setAlias] = useState(""),
    [matches, setMatches] = useState<
      { personId: string; displayName: string; reviewRequired: boolean }[]
    >([]),
    [context, setContext] = useState<{
      basisId: string;
      organizationId: string;
      assignmentId: string;
    } | null>(null);
  async function act<T>(action: string, data: unknown) {
    setBusy(true);
    setMessage("");
    try {
      return await api<T>("/api/organizations/patients", { action, data });
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="patient-page">
      <h1>Organization patient registration</h1>
      <p role="status">{message}</p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await act<typeof matches>("lookup", {
            organizationId,
            query: {
              [f.get("method") === "name" ? "namePrefix" : "exactAlias"]:
                f.get("alias"),
            },
          });
          if (r) setMatches(r);
        }}
      >
        <label>
          Search by
          <select name="method">
            <option value="id">Mhistree ID</option>
            <option value="name">Name prefix</option>
          </select>
        </label>
        <label>
          Identifier or name prefix
          <input name="alias" required minLength={3} maxLength={80} />
        </label>
        <Btn disabled={busy} type="submit">
          Find person
        </Btn>
      </form>
      {matches.map((m) => (
        <article key={m.personId}>
          <p>
            {m.displayName} ·{" "}
            {m.reviewRequired ? "Identity review required" : "Matched identity"}
          </p>
          <p>{m.personId}</p>
          <Btn onClick={() => setPatient(m.personId)}>
            Select identity for authorized care
          </Btn>
        </article>
      ))}
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await act<{ personId: string; alias: string }>("register", {
            organizationId,
            person: {
              displayName: f.get("name"),
              birthDate: f.get("birth") || null,
              contacts: [],
            },
          });
          if (r) {
            setPatient(r.personId);
            setAlias(r.alias);
          }
        }}
      >
        <h2>Register a separate provisional person</h2>
        <label>
          Known name
          <input name="name" required maxLength={200} />
        </label>
        <label>
          Known birth date (optional)
          <input name="birth" type="date" />
        </label>
        <Btn disabled={busy} type="submit">
          Register patient
        </Btn>
      </form>
      {alias && <p>Mhistree ID: {alias}</p>}
      {patient && (
        <DuplicateFlagView
          personId={patient}
          staffContext={`organization:${organizationId}`}
        />
      )}
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await act<typeof context>("initial-care", {
            organizationId,
            patientPersonId: patient,
            categories: f.getAll("categories"),
            evidence: f.get("evidence"),
          });
          if (r) setContext(r);
        }}
      >
        <h2>Authorized initial care</h2>
        <label>
          Selected patient
          <input
            value={patient}
            onChange={(e) => setPatient(e.target.value)}
            required
          />
        </label>
        <fieldset>
          <legend>Care categories</legend>
          {[
            "clinical",
            "allergy",
            "medication-use",
            "baseline",
            "ongoing",
            "symptom",
            "activity",
            "prescription",
          ].map((c) => (
            <label key={c}>
              <input name="categories" type="checkbox" value={c} />
              {c}
            </label>
          ))}
        </fieldset>
        <label>
          Identity and registration care evidence
          <textarea name="evidence" minLength={20} maxLength={2000} required />
        </label>
        <Btn disabled={busy} type="submit">
          Establish initial care
        </Btn>
      </form>
      {context && (
        <a
          href={`/organizations/record?organization=${context.organizationId}&assignment=${context.assignmentId}&basis=${context.basisId}`}
        >
          Open initial-care record
        </a>
      )}
    </section>
  );
}
