"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import { category } from "./schema";
import { CorrectionForm } from "./correction-form";
export type DisplayRecord = {
  id: string;
  logical_id: string;
  version: number;
  category: string;
  source_status: string;
  source_id: string;
  captured_at: string;
  recorded_at: string;
  author_account_id: string;
  original_organization_id: string | null;
  body: {
    text: string;
    bodySite: string | null;
    contextLinks: string[];
    medication?: {
      useStatus: string;
      plannedStart?: string | null;
      plannedEnd?: string | null;
      actualStart?: string | null;
      actualEnd?: string | null;
    };
  };
  occurred_at: {
    precision: string;
    at?: string;
    from?: string;
    to?: string;
    originalPhrase?: string;
  };
  status: string;
  source_spans: string[];
};
export function EventTime({ time }: { time: DisplayRecord["occurred_at"] }) {
  return (
    <span>
      {time.precision === "unknown"
        ? `Event date unknown${time.originalPhrase ? `: ${time.originalPhrase}` : ""}`
        : time.precision === "exact"
          ? `Exact event time: ${new Date(time.at!).toLocaleString()}`
          : `${time.precision === "approximate" ? "Approximate" : "Reported interval"}: ${new Date(time.from!).toLocaleString()} – ${new Date(time.to!).toLocaleString()}${time.originalPhrase ? ` (${time.originalPhrase})` : ""}`}
    </span>
  );
}
export function RecordCard({ record }: { record: DisplayRecord }) {
  const [source, setSource] = useState<{
      content: string;
      originalDocumentId: string | null;
    } | null>(null),
    [versions, setVersions] = useState<
      { id: string; version: number; body: { text: string } }[]
    >([]),
    [error, setError] = useState("");
  return (
    <article className="record-card" id={`event-${record.id}`}>
      <strong>
        {record.category} · {record.source_status}
      </strong>
      <p>{record.body.text}</p>
      {record.body.bodySite && <p>Body site: {record.body.bodySite}</p>}
      <p>
        <EventTime time={record.occurred_at} />
      </p>
      <p className="muted">
        Submitted: {new Date(record.captured_at).toLocaleString()} · version{" "}
        {record.version} · status: {record.status}
      </p>
      <p className="muted">
        Author: {record.author_account_id}
        {record.original_organization_id
          ? ` · Organization: ${record.original_organization_id}`
          : ""}
      </p>
      {record.body.contextLinks.length > 0 && (
        <p>
          Related activity/report:{" "}
          {record.body.contextLinks.map((id) => (
            <span key={id}>{id} </span>
          ))}{" "}
          · relationship is not proof of causation.
        </p>
      )}
      <Btn
        onClick={async () => {
          try {
            setSource(await api(`/api/records?sourceId=${record.source_id}`));
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        Original source
      </Btn>
      <Btn
        onClick={async () => {
          try {
            setVersions(
              await api(`/api/records?versions=${record.logical_id}`),
            );
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      >
        Version history
      </Btn>
      {source && (
        <details open>
          <summary>Source evidence</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{source.content}</p>
          {source.originalDocumentId && (
            <a href={`/api/documents/${source.originalDocumentId}`}>
              Download original document
            </a>
          )}
          {record.source_spans.map((span, i) => (
            <p key={i}>{span}</p>
          ))}
        </details>
      )}
      {versions.length > 0 && (
        <ol>
          {versions.map((v) => (
            <li key={v.id}>
              Version {v.version}
              {v.version < record.version ? " · superseded" : ""}: {v.body.text}
            </li>
          ))}
        </ol>
      )}
      <CorrectionForm record={record} />
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export function TimelineView() {
  const [records, setRecords] = useState<DisplayRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [filter, setFilter] = useState(""),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const q = new URLSearchParams();
    if (filter) q.set("category", filter);
    if (source) q.set("source", source);
    void api<{ items: DisplayRecord[]; nextCursor: string | null }>(
      `/api/records?${q}`,
    )
      .then((r) => {
        if (active) {
          setRecords(r.items);
          setCursor(r.nextCursor);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [filter, source]);
  return (
    <section className="patient-page">
      <h1>Your timeline</h1>
      <p>
        Accepted reports and care, linked to their evidence. Unknown event dates
        are listed after dated events.
      </p>
      <label>
        Category{" "}
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All categories</option>
          {category.options.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        {" "}
        Source{" "}
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {[
            "patient-reported",
            "patient-uploaded",
            "professional-finalized",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {!records.length && !error && <p>No accepted events to show.</p>}
      {records.map((record) => (
        <RecordCard key={record.id} record={record} />
      ))}
      {error && <p role="alert">{error}</p>}
      {cursor && (
        <Btn
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const q = new URLSearchParams({ cursor });
              if (filter) q.set("category", filter);
              if (source) q.set("source", source);
              const page = await api<{
                items: DisplayRecord[];
                nextCursor: string | null;
              }>(`/api/records?${q}`);
              setRecords([...records, ...page.items]);
              setCursor(page.nextCursor);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          More events
        </Btn>
      )}
    </section>
  );
}
