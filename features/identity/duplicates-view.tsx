"use client";
import { useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { MergeControl, ReversalView } from "./merge-view";
export function DuplicateFlagView({
  personId,
  staffContext,
}: {
  personId: string;
  staffContext?: string;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="patient-page">
      <h1>Report a possible duplicate</h1>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api("/api/identity/duplicates", {
              personId,
              ...(staffContext ? { staffContext } : {}),
              candidateId: f.get("candidate"),
              reason: f.get("reason"),
            });
            setMessage(
              "Submitted for identity review. Records remain separate until verified.",
            );
          } catch (e) {
            setMessage(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Other Mhistree ID or person identifier
          <input name="candidate" required />
        </label>
        <label>
          Reason for review
          <textarea name="reason" minLength={20} maxLength={2000} required />
        </label>
        <Btn type="submit" disabled={busy}>
          Flag possible duplicate
        </Btn>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
type Case = {
  id: string;
  left_name: string;
  right_name: string;
  left_person_id: string;
  right_person_id: string;
  state: string;
  reason: string;
  version: number;
};
type Preview = {
  survivorId: string | null;
  rule: string;
  grants: {
    id: string;
    kind: string;
    status: string;
    categories: string[];
    exclusions: string[];
    origin_person_ids: string[];
    origin_context_ids: string[];
  }[];
};
export function DuplicateReviewView({ initial }: { initial: Case[] }) {
  const [rows, setRows] = useState(initial),
    [preview, setPreview] = useState<{ id: string; data: Preview } | null>(
      null,
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function inspect(id: string) {
    setBusy(true);
    try {
      setPreview({
        id,
        data: await api<Preview>(`/api/review/duplicates?id=${id}`),
      });
    } catch (e) {
      setPreview(null);
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="patient-page">
      <h1>Duplicate identity review</h1>
      <p role="status">{message}</p>
      {rows.length === 0 && <p>No duplicate reports.</p>}
      {rows.map((c) => (
        <article key={c.id}>
          <h2>
            {c.left_name} / {c.right_name}
          </h2>
          <p>
            {c.state} · {c.reason}
          </p>
          <Btn disabled={busy} onClick={() => void inspect(c.id)}>
            Inspect survivor and access
          </Btn>
          {preview?.id === c.id && (
            <>
              <p>{preview.data.rule}</p>
              <p>
                Proposed survivor:{" "}
                {preview.data.survivorId ?? "Further identity review required"}
              </p>
              {preview.data.grants.map((g) => (
                <p key={g.id}>
                  {g.kind} · {g.status} · categories: {g.categories?.join(", ")}{" "}
                  · exclusions: {g.exclusions?.join(", ")} · original identity
                  scope: {g.origin_person_ids?.join(", ")}
                </p>
              ))}
              {c.state === "approved" && preview.data.survivorId && (
                <MergeControl
                  caseId={c.id}
                  version={c.version}
                  survivorId={preview.data.survivorId}
                />
              )}
              {["pending", "escalated"].includes(c.state) && (
                <form
                  className="account-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    const f = new FormData(e.currentTarget);
                    try {
                      await api("/api/review/duplicates", {
                        id: c.id,
                        version: c.version,
                        decision: f.get("decision"),
                        identityEvidence: f.get("evidence"),
                        ownershipVerified: f.has("ownership"),
                        expectedSurvivorId: preview.data.survivorId,
                      });
                      setRows(await api<Case[]>("/api/review/duplicates"));
                      setPreview(null);
                      setMessage("Review recorded.");
                    } catch (e) {
                      setMessage(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    Decision
                    <select name="decision">
                      <option value="escalated">
                        Escalate uncertain identity
                      </option>
                      <option value="rejected">Reject match</option>
                      <option value="approved">
                        Approve verified duplicate
                      </option>
                    </select>
                  </label>
                  <label>
                    <input name="ownership" type="checkbox" />I verified
                    identity and ownership of both records.
                  </label>
                  <label>
                    Restricted identity evidence
                    <textarea
                      name="evidence"
                      minLength={20}
                      maxLength={3000}
                      required
                    />
                  </label>
                  <Btn disabled={busy} type="submit">
                    Record review
                  </Btn>
                </form>
              )}
            </>
          )}
        </article>
      ))}
      <ReversalView />
    </section>
  );
}
