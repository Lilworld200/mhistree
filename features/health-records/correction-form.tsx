"use client";
import { useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import type { DisplayRecord } from "./timeline-view";
export function CorrectionForm({ record }: { record: DisplayRecord }) {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const key = useRef("");
  const professional = record.source_status === "professional-finalized";
  return (
    <details>
      <summary>
        {professional
          ? "Request a professional correction"
          : "Correct your report"}
      </summary>
      <p>
        {professional
          ? "Professional findings require review. Your request will not rewrite the finding."
          : "The original and previous versions remain available. Saving also updates the linked health summary."}
      </p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setMessage("");
          const f = new FormData(e.currentTarget);
          key.current ||= crypto.randomUUID();
          try {
            const data = professional
              ? {
                  kind: "professional-correction",
                  eventId: record.id,
                  reason: f.get("text"),
                  requestKey: key.current,
                }
              : {
                  eventId: record.id,
                  version: record.version,
                  requestKey: key.current,
                  text: f.get("text"),
                  bodySite: f.get("bodySite") || null,
                  status: f.get("status"),
                  ...(record.category === "medication-use"
                    ? {
                        medication: {
                          useStatus: f.get("useStatus"),
                          plannedStart: f.get("plannedStart") || null,
                          plannedEnd: f.get("plannedEnd") || null,
                          actualStart: f.get("actualStart") || null,
                          actualEnd: f.get("actualEnd") || null,
                        },
                      }
                    : {}),
                };
            await api("/api/health", {
              action: professional ? "review" : "correct",
              data,
            });
            setMessage(
              professional
                ? "Review request submitted."
                : "Correction saved. Reload this view to see the new version.",
            );
          } catch (error) {
            setMessage(errorMessage(error));
          } finally {
            setPending(false);
          }
        }}
      >
        <label>
          {professional ? "Explain your concern" : "Corrected report"}
          <textarea
            name="text"
            defaultValue={professional ? "" : record.body.text}
            required
            maxLength={3000}
          />
        </label>
        {!professional && (
          <>
            <label>
              Body site
              <input
                name="bodySite"
                defaultValue={record.body.bodySite ?? ""}
                maxLength={100}
              />
            </label>
            <label>
              Status
              <select name="status" defaultValue={record.status}>
                {["active", "resolved", "recurrent", "unknown"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {record.category === "medication-use" && (
              <>
                <label>
                  Actual use
                  <select
                    name="useStatus"
                    defaultValue={
                      record.body.medication?.useStatus ?? "unknown"
                    }
                  >
                    {["taking", "stopped", "not-started", "unknown"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                </label>
                {["plannedStart", "plannedEnd", "actualStart", "actualEnd"].map(
                  (name) => (
                    <label key={name}>
                      {
                        (
                          {
                            plannedStart: "Planned start",
                            plannedEnd: "Planned end",
                            actualStart: "Actual start",
                            actualEnd: "Actual end",
                          } as Record<string, string>
                        )[name]
                      }{" "}
                      (optional)
                      <input
                        name={name}
                        type="date"
                        defaultValue={
                          record.body.medication?.[
                            name as
                              | "plannedStart"
                              | "plannedEnd"
                              | "actualStart"
                              | "actualEnd"
                          ] ?? ""
                        }
                      />
                    </label>
                  ),
                )}
              </>
            )}
          </>
        )}
        <Btn type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : professional
              ? "Submit review request"
              : "Save correction"}
        </Btn>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
