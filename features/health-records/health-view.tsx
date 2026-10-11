"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client-api";
import { RecordCard, type DisplayRecord } from "./timeline-view";
type State = {
  items: (DisplayRecord & {
    medicationPresentation: { useStatus: string; explanation: string } | null;
  })[];
  prescriptions: DisplayRecord[];
  limited: boolean;
};
export function HealthView() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api<State>("/api/health")
      .then(setState)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <section className="patient-page">
      <h1>Your health details</h1>
      <p>
        Last-known reports with their sources. Silence does not establish
        recovery, continued medication use, or adherence.
      </p>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">Loading health details…</p>}
      {["medication-use", "allergy", "baseline", "ongoing"].map((category) => (
        <section key={category}>
          <h2>
            {
              (
                {
                  "medication-use": "Medication use",
                  allergy: "Allergies",
                  baseline: "Baseline",
                  ongoing: "Ongoing issues",
                } as Record<string, string>
              )[category]
            }
          </h2>
          {state && !state.items.some((i) => i.category === category) && (
            <p>
              No accepted reports in this category. This does not mean none
              exist.
            </p>
          )}
          {state?.items
            .filter((i) => i.category === category)
            .map((record) => (
              <div key={record.id}>
                {record.medicationPresentation && (
                  <p>
                    Current use: {record.medicationPresentation.useStatus}.{" "}
                    {record.medicationPresentation.explanation}
                  </p>
                )}
                <RecordCard record={record} />
              </div>
            ))}
        </section>
      ))}
      <section>
        <h2>Practitioner prescription information</h2>
        <p>
          Separate from reported use. Recording a prescription does not prove
          dispensing or fulfillment.
        </p>
        {state?.prescriptions.map((record) => (
          <RecordCard key={record.id} record={record} />
        ))}
      </section>
      {state?.limited && (
        <p>
          This is a bounded summary.{" "}
          <Link href="/timeline">Browse more in your timeline.</Link>
        </p>
      )}
    </section>
  );
}
