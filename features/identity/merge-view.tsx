"use client";
import { useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Preview = {
  operationId: string;
  survivorId: string;
  loserId: string;
  reviewToken: string;
  disposition: string;
  inventory: {
    records: { id: string; origin_person_id: string }[];
    consents: { id: string }[];
  };
};
export function MergeControl({
  caseId,
  version,
  survivorId,
}: {
  caseId: string;
  version: number;
  survivorId: string;
}) {
  const key = useRef<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <form
      className="account-form"
      onSubmit={async (e) => {
        e.preventDefault();
        key.current ??= crypto.randomUUID();
        setBusy(true);
        try {
          const r = await api<{
            operationId: string;
            providerRevocationPending: boolean;
          }>("/api/review/merges", {
            action: "merge",
            data: {
              caseId,
              version,
              expectedSurvivorId: survivorId,
              operationId: key.current,
            },
          });
          setMessage(
            `Merge recorded. Operation: ${r.operationId}.${r.providerRevocationPending ? " Provider session retirement is pending. Local access is blocked; retry this same operation to retry provider retirement." : " Provider session retirement completed."}`,
          );
        } catch (e) {
          setMessage(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        <input type="checkbox" required />I reviewed the survivor and original
        access scopes. Retire the losing login and merge these verified
        identities.
      </label>
      <Btn type="submit" disabled={busy}>
        Execute verified merge
      </Btn>
      <p role="status">{message}</p>
    </form>
  );
}
export function ReversalView() {
  const [preview, setPreview] = useState<Preview | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    key = useRef<string | null>(null);
  return (
    <section>
      <h2>Review merge reversal</h2>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setPreview(
              await api<Preview>(
                `/api/review/merges?operation=${new FormData(e.currentTarget).get("operation")}`,
              ),
            );
            key.current = null;
          } catch (e) {
            setPreview(null);
            setMessage(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Merge operation identifier
          <input name="operation" required />
        </label>
        <Btn disabled={busy} type="submit">
          Preview reversal
        </Btn>
      </form>
      {preview && (
        <>
          <p>{preview.disposition}</p>
          <p>
            {preview.inventory.records.length} later contributions;{" "}
            {preview.inventory.consents.length} later consent versions.
          </p>
          {preview.inventory.records.map((r) => (
            <p key={r.id}>
              {r.id} stays with origin {r.origin_person_id}
            </p>
          ))}
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              key.current ??= crypto.randomUUID();
              try {
                await api("/api/review/merges", {
                  action: "reverse",
                  data: {
                    mergeOperationId: preview.operationId,
                    operationId: key.current,
                    reviewToken: preview.reviewToken,
                    evidence: new FormData(e.currentTarget).get("evidence"),
                    reviewedLaterWork: true,
                  },
                });
                setPreview(null);
                setMessage("Reversal recorded. Retired logins remain retired.");
              } catch (e) {
                setMessage(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Reversal evidence
              <textarea
                name="evidence"
                minLength={20}
                maxLength={3000}
                required
              />
            </label>
            <label>
              <input type="checkbox" required />I reviewed all later
              contributions and consent and their retained origin identity.
            </label>
            <Btn disabled={busy} type="submit">
              Reverse reviewed merge
            </Btn>
          </form>
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
