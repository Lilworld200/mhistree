"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import { notifyRecordsChanged } from "@/features/health-records/record-updates";
type Job = {
  id: string;
  message_id: string | null;
  document_source_id: string | null;
  state: string;
  issues: string[];
  attempts: number;
};
export function ExtractionStatus({ revision = 0 }: { revision?: number }) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void api<Job[]>("/api/extraction")
      .then(setJobs)
      .catch((e) => setError(errorMessage(e)));
  }, [revision]);
  return (
    <section aria-label="Report processing">
      <h2>Report processing</h2>
      {jobs.slice(0, 10).map((job) => (
        <div className="record-card" key={job.id}>
          <strong>
            {job.document_source_id ? "Document" : "Message"} · {job.state}
          </strong>
          {job.issues.map((issue, i) => (
            <p key={i}>{issue}</p>
          ))}
          {["queued", "partial", "failed", "running"].includes(job.state) &&
            job.attempts < 5 && (
              <Btn
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy(job.id);
                  try {
                    await api("/api/extraction", { id: job.id });
                    notifyRecordsChanged();
                    setJobs(await api("/api/extraction"));
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {busy === job.id ? "Processing…" : "Process / retry"}
              </Btn>
            )}
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
