"use client";
import { useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { category } from "@/features/health-records/schema";
type Patient = {
  id: string;
  display_name: string;
  patient_person_id: string;
  status: string;
};
export function PatientsView({ initial }: { initial: Patient[] }) {
  const [rows, setRows] = useState(initial),
    [candidates, setCandidates] = useState<
      { personId: string; displayName: string; reviewRequired: boolean }[]
    >([]),
    [message, setMessage] = useState("");
  async function action(action: string, data: unknown) {
    try {
      const result = await api<unknown>("/api/practitioner/patients", {
        action,
        data,
      });
      setRows(await api<Patient[]>("/api/practitioner/patients"));
      return result;
    } catch (e) {
      setMessage(errorMessage(e));
    }
  }
  return (
    <section className="patient-page">
      <h1>My patients · Direct context</h1>
      <p>
        Finding a person identifies them; it does not authorize reading their
        history. Organization contexts arrive with organization assignments.
      </p>
      {rows.map((row) => (
        <article className="record-card" key={row.id}>
          <strong>{row.display_name}</strong>
          <p>{row.status}</p>
          {row.status === "active" && (
            <Link href={`/clinician/patients/${row.id}`}>
              Open authorized record
            </Link>
          )}
        </article>
      ))}
      <h2>Controlled lookup</h2>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const result = await action("lookup", { exactAlias: f.get("alias") });
          if (result) setCandidates(result as typeof candidates);
        }}
      >
        <label>
          Mhistree ID
          <input name="alias" required />
        </label>
        <Btn type="submit">Find person</Btn>
      </form>
      {candidates.map((p) => (
        <article className="record-card" key={p.personId}>
          <h3>{p.displayName}</h3>
          {p.reviewRequired && (
            <p>
              Provisional identity: resolve uncertainty without opening another
              person's history.
            </p>
          )}
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await action("connect", {
                patientPersonId: p.personId,
                requestKey: crypto.randomUUID(),
                method: f.get("method"),
                categories: f.getAll("category"),
                exclusions: [],
                ...(f.get("evidence") ? { evidence: f.get("evidence") } : {}),
              });
              if (result)
                setMessage(
                  "Connection recorded. Login approval stays pending until the patient approves.",
                );
            }}
          >
            <label>
              Consent method
              <select name="method">
                <option value="login">Request patient login approval</option>
                <option value="in-person">
                  Record identity-checked in-person consent
                </option>
              </select>
            </label>
            <fieldset>
              <legend>
                Requested categories (unchecked categories are excluded)
              </legend>
              {category.options.map((c) => (
                <label key={c}>
                  <input name="category" value={c} type="checkbox" />
                  {c}
                </label>
              ))}
            </fieldset>
            <label>
              Identity check and consent evidence (required for in-person)
              <textarea name="evidence" minLength={20} />
            </label>
            <Btn type="submit">Record connection</Btn>
          </form>
        </article>
      ))}
      <h2>Register a person without a login</h2>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const result = (await action("register", {
            displayName: f.get("name"),
            birthDate: f.get("birthDate") || null,
            contacts: [],
          })) as { alias?: string } | undefined;
          if (result?.alias)
            setMessage(
              `Registered provisional person: ${result.alias}. This ID does not grant record access.`,
            );
        }}
      >
        <label>
          Known name
          <input name="name" required />
        </label>
        <label>
          Birth date, if known
          <input name="birthDate" type="date" />
        </label>
        <Btn type="submit">Register person</Btn>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
