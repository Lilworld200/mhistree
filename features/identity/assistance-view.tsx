"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
export function AssistanceView({ organizationId }: { organizationId: string }) {
  const [code, setCode] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) return;
    const timer = setTimeout(() => setCode(""), 120000);
    const hide = () => {
      if (document.hidden) setCode("");
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [code]);
  return (
    <section className="patient-page">
      <h1>Identity assistance</h1>
      <p role="status">{message}</p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setCode("");
          setMessage("");
          const f = new FormData(e.currentTarget);
          try {
            const action = f.get("purpose"),
              result = await api<{
                code?: string;
                providerRevocationPending?: boolean;
              }>("/api/organizations/assistance", {
                action: action === "escalate" ? "escalate" : "issue",
                data:
                  action === "escalate"
                    ? {
                        organizationId,
                        personId: f.get("person"),
                        evidence: f.get("evidence"),
                      }
                    : {
                        organizationId,
                        personId: f.get("person"),
                        purpose: action,
                        verificationMethod: f.get("method"),
                        evidenceReference: f.get("evidence"),
                      },
              });
            setCode(result.code ?? "");
            setMessage(
              action === "escalate"
                ? "Submitted to identity support."
                : result.providerRevocationPending
                  ? "Prior app sessions are retired. Provider session retirement is pending."
                  : "Private credential issued. The patient chooses their password.",
            );
          } catch (e) {
            setMessage(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Patient identifier
          <input name="person" required />
        </label>
        <label>
          Action
          <select name="purpose">
            <option value="activation">
              Issue or replace unactivated setup
            </option>
            <option value="recovery">Recover activated account</option>
            <option value="escalate">Escalate uncertain ownership</option>
          </select>
        </label>
        <label>
          Verification method
          <input name="method" minLength={5} maxLength={60} required />
        </label>
        <label>
          Restricted evidence reference
          <textarea name="evidence" minLength={20} maxLength={120} required />
        </label>
        <Btn disabled={busy} type="submit">
          Submit identity assistance
        </Btn>
      </form>
      {code && (
        <section>
          <h2>Private one-time credential</h2>
          <p>
            Give this directly to the identified patient. Valid for 20 minutes;
            hidden here after two minutes or when this tab is hidden.
          </p>
          <output style={{ overflowWrap: "anywhere" }}>{code}</output>
          <Btn onClick={() => setCode("")}>Hide credential</Btn>
          <Link href="/auth">Patient setup and recovery</Link>
        </section>
      )}
    </section>
  );
}
type Case = {
  id: string;
  display_name: string;
  person_id: string;
  organization_id: string;
  evidence: string;
  state: string;
  version: number;
};
export function IdentitySupportView({ initial }: { initial: Case[] }) {
  const [rows, setRows] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function act(action: string, data: unknown) {
    setBusy(true);
    try {
      await api("/api/review/identity", { action, data });
      setRows(await api<Case[]>("/api/review/identity"));
      setMessage("Decision recorded.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="patient-page">
      <h1>Restricted identity support</h1>
      <p role="status">{message}</p>
      {rows.map((c) => (
        <article key={c.id}>
          <h2>{c.display_name}</h2>
          <p>
            {c.state} · {c.evidence}
          </p>
          {c.state === "pending" && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("review", {
                  id: c.id,
                  version: c.version,
                  decision: f.get("decision"),
                  evidence: f.get("evidence"),
                });
              }}
            >
              <label>
                Decision
                <select name="decision">
                  <option value="resolved">Resolved identity review</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <label>
                Review evidence
                <textarea
                  name="evidence"
                  minLength={20}
                  maxLength={2000}
                  required
                />
              </label>
              <Btn type="submit" disabled={busy}>
                Record review
              </Btn>
            </form>
          )}
        </article>
      ))}
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act("designate", {
            organizationId: f.get("organization"),
            accountId: f.get("account"),
            active: f.has("active"),
            evidence: f.get("evidence"),
          });
        }}
      >
        <h2>Designated recovery staff</h2>
        <label>
          Organization identifier
          <input name="organization" required />
        </label>
        <label>
          Staff account identifier
          <input name="account" required />
        </label>
        <label>
          <input name="active" type="checkbox" />
          Authorize recovery
        </label>
        <label>
          Designation evidence
          <textarea name="evidence" minLength={20} maxLength={2000} required />
        </label>
        <Btn type="submit" disabled={busy}>
          Record designation
        </Btn>
      </form>
    </section>
  );
}
