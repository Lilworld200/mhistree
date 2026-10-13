"use client";
import { useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Application = {
  id: string;
  legal_name: string;
  profession: string;
  registration_number: string;
  jurisdiction: string;
  status: string;
  version: number;
};
const privileges = [
  "records.read",
  "records.write",
  "appointments.manage",
  "messages.send",
  "requests.read",
  "requests.create",
  "results.finalize",
  "person.register",
  "person.lookup",
  "auth.activate",
];
export function ReviewView({ initial }: { initial: Application[] }) {
  const [rows, setRows] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="patient-page">
      <h1>Professional credential review</h1>
      <p>
        Check credentials against an authoritative licensing source. Record the
        evidence and grant only justified privileges. Review access does not
        grant patient record access.
      </p>
      {rows.map((row) => (
        <article className="record-card" key={row.id}>
          <h2>{row.legal_name}</h2>
          <p>
            {row.profession} · {row.registration_number} · {row.jurisdiction} ·{" "}
            {row.status}
          </p>
          <a href={`/api/review?credential=${row.id}`} download>
            Download private credential
          </a>
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await api("/api/review", {
                  applicationId: row.id,
                  version: row.version,
                  decision: f.get("decision"),
                  authorityUrl: f.get("authorityUrl"),
                  evidence: f.get("evidence"),
                  privileges: f.getAll("privilege"),
                });
                setRows(await api<Application[]>("/api/review"));
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Decision
              <select name="decision">
                <option>approved</option>
                <option>rejected</option>
                <option>suspended</option>
              </select>
            </label>
            <label>
              Authoritative source URL
              <input name="authorityUrl" type="url" required />
            </label>
            <label>
              Review evidence
              <textarea name="evidence" minLength={20} required />
            </label>
            {privileges.map((p) => (
              <label key={p}>
                <input type="checkbox" name="privilege" value={p} />
                {p}
              </label>
            ))}
            <Btn type="submit" disabled={busy}>
              Record decision
            </Btn>
          </form>
        </article>
      ))}
      <p role="alert">{error}</p>
    </section>
  );
}
