"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { RecordCard, type DisplayRecord } from "./timeline-view";
type State = {
  items: (DisplayRecord & {
    medicationPresentation: { useStatus: string; explanation: string } | null;
  })[];
  prescriptions: DisplayRecord[];
  recommendations?: {
    id: string;
    name: string;
    details: string;
    state: string;
    version: number;
  }[];
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
    <section className="scroll restored-health">
      <header className="hero">
        <div className="hrow">
          <span className="hid">
            <span className="profile-avatar">
              <Icon n="user" s={18} />
            </span>
            <b>Health Dashboard</b>
          </span>
          <Icon n="heart" s={20} />
        </div>
        <div className="hcenter">
          <span className="hpill">Your continuing health record</span>
          <h1 className="display health-hero-title">Your health, in view</h1>
          <span className="hsub">Source-linked reports and care, together</span>
        </div>
      </header>
      <div className="actrow">
        <Btn icon="doc" asChild>
          <Link href="/documents">Documents</Link>
        </Btn>
        <Btn asChild>
          <Link href="/timeline">View timeline</Link>
        </Btn>
        <Btn kind="dark" icon="chat" asChild>
          <Link href="/chat">Start check-in</Link>
        </Btn>
      </div>
      <p className="psub health-intro">
        Last-known reports with their sources. Silence does not establish
        recovery, continued medication use, or adherence.
      </p>
      {error && <p role="alert">{error}</p>}
      {!state && !error && <p role="status">Loading health details…</p>}
      {Boolean(state?.recommendations?.length) && (
        <section
          className="card health-category"
          aria-label="Medication recommendations"
        >
          <h2>Recommendations & plans</h2>
          {state?.recommendations?.map((r) => (
            <article key={r.id}>
              <h3>
                {r.name} · {r.state}
              </h3>
              <p>{r.details}</p>
              <p>A recommendation or planned start does not confirm use.</p>
              <Btn
                onClick={async () => {
                  try {
                    await api("/api/health", {
                      action: "dismiss-recommendation",
                      data: { id: r.id, version: r.version },
                    });
                    setState(await api<State>("/api/health"));
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Dismiss follow-ups for {r.name}
              </Btn>
            </article>
          ))}
        </section>
      )}
      <div className="grid2 health-grid">
        {["medication-use", "allergy", "baseline", "ongoing"].map(
          (category) => (
            <section className="card health-category" key={category}>
              <h2 className="mlabel">
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
                <p className="health-empty">
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
                        Reported use: {record.medicationPresentation.useStatus}.{" "}
                        {record.medicationPresentation.explanation}
                      </p>
                    )}
                    <RecordCard record={record} />
                  </div>
                ))}
            </section>
          ),
        )}
      </div>
      <section className="card prescription-card">
        <h2 className="mlabel">Practitioner prescription information</h2>
        <p>
          Separate from reported use. Recording a prescription does not prove
          dispensing or fulfillment.
        </p>
        {state && !state.prescriptions.length && (
          <p className="health-empty">
            No practitioner prescriptions recorded.
          </p>
        )}
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
