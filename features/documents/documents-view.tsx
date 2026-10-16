"use client";
import { useEffect, useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { ExtractionStatus } from "@/features/ai-chat/extraction/status-view";
type Document = {
  source_id: string;
  filename: string;
  status: string;
  attempts: number;
  pages: { page: number; text: string }[] | null;
};
export function DocumentsView() {
  const [documents, setDocuments] = useState<Document[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const pending = useRef<{ file: File; key: string } | null>(null);
  useEffect(() => {
    void api<Document[]>("/api/documents")
      .then(setDocuments)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  async function parse(id: string) {
    await api("/api/documents", { action: "parse", data: { id } });
    const jobs =
      await api<
        { id: string; document_source_id: string | null; state: string }[]
      >("/api/extraction");
    for (const job of jobs.filter(
      (j) => j.document_source_id && j.state === "queued",
    ))
      await api("/api/extraction", { id: job.id });
    setDocuments(await api("/api/documents"));
    setRevision((r) => r + 1);
  }
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const file = new FormData(e.currentTarget).get("file") as File;
      if (!file || file.size > 10 * 1024 * 1024)
        throw new Error("VALIDATION_FAILED");
      if (
        !pending.current ||
        pending.current.file.name !== file.name ||
        pending.current.file.lastModified !== file.lastModified
      )
        pending.current = { file, key: crypto.randomUUID() };
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api<{ source_id: string }>("/api/documents", {
        action: "upload",
        data: {
          filename: file.name,
          mime: file.type,
          base64,
          key: pending.current.key,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      pending.current = null;
      setDocuments(await api("/api/documents"));
      await parse(result.source_id);
    } catch (e) {
      setError(errorMessage(e));
      setDocuments(await api<Document[]>("/api/documents").catch(() => []));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="scroll restored-documents patient-page">
      <header className="phead">
        <div>
          <h1 className="ptitle">Documents</h1>
          <p className="psub">
            Labs, prescriptions and reports — evidence behind your timeline
          </p>
        </div>
      </header>
      <p>
        Keep the original and see what was extracted. Uploads are
        patient-provided information, not clinically verified results.
      </p>
      <form className="account-form card document-upload" onSubmit={upload}>
        <label>
          PDF or UTF-8 text file (up to 10 MB)
          <input
            name="file"
            type="file"
            accept="application/pdf,text/plain"
            required
          />
        </label>
        <Btn type="submit" disabled={busy}>
          {busy ? "Processing…" : "Upload document"}
        </Btn>
      </form>
      <p className="muted">
        Text PDFs up to 100 pages are supported. Scans with no readable text
        remain recoverable but require another readable copy. Active or
        encrypted PDFs are quarantined. Downloads are private; previously
        downloaded copies cannot be recalled.
      </p>
      {error && <p role="alert">{error}</p>}
      {!documents.length && <p>No documents uploaded yet.</p>}
      <div className="grid3 document-grid">
        {documents.map((doc) => (
          <article className="card document-card" key={doc.source_id}>
            <h2>{doc.filename}</h2>
            <p>Status: {doc.status}</p>
            <a href={`/api/documents/${doc.source_id}`}>Download original</a>
            {["queued", "failed", "parsing"].includes(doc.status) &&
              doc.attempts < 5 && (
                <Btn
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await parse(doc.source_id);
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Retry processing
                </Btn>
              )}
            {doc.status === "quarantined" && (
              <p>
                Held for review. The original is retained; extraction has not
                run.
              </p>
            )}
            {doc.pages && (
              <details>
                <summary>Read extracted pages</summary>
                {doc.pages.map((page) => (
                  <section key={page.page}>
                    <h3>Page {page.page}</h3>
                    <p style={{ whiteSpace: "pre-wrap" }}>{page.text}</p>
                  </section>
                ))}
              </details>
            )}
          </article>
        ))}
      </div>
      <ExtractionStatus revision={revision} />
    </section>
  );
}
