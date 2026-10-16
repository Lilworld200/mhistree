"use client";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { Btn } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
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
export const recordLabels: Record<string, string> = {
  symptom: "Symptoms",
  activity: "Activity",
  "medication-use": "Medication use",
  allergy: "Allergies",
  baseline: "Baseline",
  ongoing: "Ongoing issues",
  document: "Documents",
  "clinical-entry": "Clinical care",
  clinical: "Clinical care",
  prescription: "Prescriptions",
  result: "Results",
};
const recordIcons: Record<string, IconName> = {
  activity: "pulse",
  "medication-use": "heart",
  allergy: "alert",
  document: "doc",
  baseline: "user",
  result: "doc",
};
export const sourceLabels: Record<string, string> = {
  "patient-reported": "Patient reported",
  "patient-uploaded": "Patient uploaded",
  "professional-finalized": "Professional finalized",
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
    <details className="card record-evidence" id={`event-${record.id}`}>
      <summary className="evcard">
        <span className="tic record-category-icon">
          <Icon n={recordIcons[record.category] ?? "pulse"} s={17} />
        </span>
        <span className="evmain">
          <b>{recordLabels[record.category] ?? record.category}</b>
          <span className="evwhen">
            <EventTime time={record.occurred_at} />
          </span>
          <span className="evdesc ell2">{record.body.text}</span>
          <span className="evbadges">
            <span className="badge">
              {sourceLabels[record.source_status] ?? record.source_status}
            </span>
            <span className="badge">{record.status}</span>
          </span>
        </span>
        <Icon n="chev" s={16} />
      </summary>
      <div className="record-evidence-body">
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
                {v.version < record.version ? " · superseded" : ""}:{" "}
                {v.body.text}
              </li>
            ))}
          </ol>
        )}
        <CorrectionForm record={record} />
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
export function TimelineView() {
  const [records, setRecords] = useState<DisplayRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [filter, setFilter] = useState(""),
    [source, setSource] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
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
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [filter, source]);
  return (
    <section className="scroll restored-timeline">
      <header className="phead">
        <div>
          <h1 className="ptitle">Health Timeline</h1>
          <p className="psub">
            Your longitudinal record · every fact keeps its source
          </p>
        </div>
        <span className="hpill hpill-dark">
          <Icon n="shield" s={13} />
          Source-linked history
        </span>
      </header>
      <div
        className="pills"
        role="group"
        aria-label="Filter events by category"
      >
        {["", ...category.options].map((c) => (
          <button
            key={c}
            type="button"
            className={`pill${filter === c ? " on" : ""}`}
            aria-pressed={filter === c}
            onClick={() => {
              if (filter !== c) {
                setLoading(true);
                setFilter(c);
              }
            }}
          >
            {c ? (recordLabels[c] ?? c) : "All"}
          </button>
        ))}
      </div>
      <div
        className="pills pills-sub"
        role="group"
        aria-label="Filter events by source"
      >
        {[
          "",
          "patient-reported",
          "patient-uploaded",
          "professional-finalized",
        ].map((s) => (
          <button
            key={s}
            type="button"
            className={`pill pill-tiny${source === s ? " on" : ""}`}
            aria-pressed={source === s}
            onClick={() => {
              if (source !== s) {
                setLoading(true);
                setSource(s);
              }
            }}
          >
            {s ? sourceLabels[s] : "All sources"}
          </button>
        ))}
      </div>
      <p className="psub timeline-explanation">
        Unknown event dates are listed after dated events.
      </p>
      <div className="mlabel timeline-records-label">Timeline records</div>
      {loading && (
        <p className="card ui-empty" role="status">
          Loading your timeline…
        </p>
      )}
      {!loading && !records.length && !error && (
        <div className="card ui-empty">
          <Icon n="pulse" s={28} />
          <p>No accepted events to show.</p>
          <span>
            Your reports and finalized care will appear here with their sources.
          </span>
        </div>
      )}
      <div className="tl" aria-busy={loading}>
        {records.map((record) => (
          <RecordCard key={record.id} record={record} />
        ))}
      </div>
      {error && (
        <p className="ui-notice" role="alert">
          {error}
        </p>
      )}
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
