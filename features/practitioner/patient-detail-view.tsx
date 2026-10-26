"use client";
import { PatientActionButton } from "./patient-action-button";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { Btn } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { SidePanel } from "@/components/ui/side-panel";
import { api, errorMessage } from "@/lib/client-api";
import {
  EventTime,
  sourceLabels,
  recordLabels,
  type DisplayRecord,
} from "@/features/health-records/timeline-view";
import { recordNarrative } from "@/features/health-records/narrative";
import { medicationPresentation } from "@/features/health-records/current-state-presentation";
import { WorkspaceView } from "./workspace-view";
import { PatientSnapshot } from "./patient-snapshot";
import type { PatientOverview } from "./patient-types";
type Detail = {
  patient: {
    display_name: string;
    birth_date: string | null;
    mhistree_id: string | null;
  };
  revision: number;
  permissions: { read: string[]; write: string[] };
  overview: PatientOverview;
  state: DisplayRecord[];
  recent: DisplayRecord[];
  limited: boolean;
  work: unknown[];
  requests: unknown[];
  messages: unknown | null;
};
type Panel = "summary" | "ai" | "work" | "requests" | "messages";
function ClinicalRecord({ record }: { record: DisplayRecord }) {
  return (
    <article className="patient-clinical-record" id={`event-${record.id}`}>
      <div className="patient-record-meta">
        <span>{recordLabels[record.category] ?? record.category}</span>
        <span>
          {sourceLabels[record.source_status] ?? record.source_status}
        </span>
      </div>
      <p>{recordNarrative(record)}</p>
      <small>
        {record.category === "medication-use"
          ? `Reported use: ${medicationPresentation(record.body).useStatus}`
          : record.status}{" "}
        · Recorded{" "}
        {new Date(record.recorded_at).toLocaleString("en-GB", {
          timeZone: "Africa/Lagos",
        })}
      </small>
      {record.category === "medication-use" && (
        <p className="sharing-help">
          {medicationPresentation(record.body).explanation}
        </p>
      )}
      <details>
        <summary>Evidence and dates</summary>
        {record.occurred_at && (
          <p>
            <EventTime time={record.occurred_at} />
          </p>
        )}
        {record.source_spans?.map((span, i) => (
          <blockquote key={i}>{span}</blockquote>
        ))}
        <small>
          Version {record.version} · Author reference {record.author_account_id}
        </small>
      </details>
    </article>
  );
}
function PatientAssistant({
  connectionId,
  summary = false,
}: {
  connectionId: string;
  summary?: boolean;
}) {
  const [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [turns, setTurns] = useState<
    {
      question: string;
      text: string;
      limitations: string[];
      evidenceIds: string[];
    }[]
  >([]);
  const end = useRef<HTMLDivElement | null>(null);
  async function send(text: string, purpose = "question") {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await api<{
        text: string;
        limitations: string[];
        evidenceIds: string[];
      }>("/api/practitioner/workspace", {
        connectionId,
        action: "ai",
        data: { question: text, purpose, includeOwnNotes: false },
      });
      setTurns((old) => [...old, { question: text, ...response }]);
      setQuestion("");
      end.current?.scrollIntoView?.({ block: "nearest" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="patient-assistant">
      <p className="sharing-help">
        Ask about this patient&apos;s currently shared records. AI responses
        require your review and do not become clinical entries.
      </p>
      {summary && (
        <Btn
          icon="spark"
          disabled={busy}
          onClick={() =>
            void send(
              "Summarize this patient's authorized history and persistent health details. Distinguish today's reports from older history, medication use from prescriptions, and preserve uncertainty and dates.",
              "summary",
            )
          }
        >
          Generate AI summary
        </Btn>
      )}
      {!turns.length && !summary && (
        <div className="patient-assistant-empty">
          <Icon n="chat" s={28} />
          <h3>Explore the patient&apos;s record</h3>
          <p>
            Ask about reported symptoms, medication history or changes over
            time.
          </p>
        </div>
      )}
      <div
        className="patient-assistant-turns"
        aria-label="Patient AI conversation"
        aria-live="polite"
      >
        {turns.map((turn, index) => (
          <div key={index}>
            <p className="patient-ai-question">{turn.question}</p>
            <article className="patient-ai-response">
              <small>AI assistance · Human review required</small>
              <p>{turn.text}</p>
              {turn.limitations.map((text, i) => (
                <p className="sharing-help" key={i}>
                  {text}
                </p>
              ))}
              <details>
                <summary>{turn.evidenceIds.length} supporting records</summary>
                {turn.evidenceIds.length ? (
                  <p>
                    Evidence is drawn from the current authorized record. Review
                    the shared history alongside this response.
                  </p>
                ) : (
                  <p>No finalized supporting record was cited.</p>
                )}
              </details>
            </article>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="patient-ai-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(question);
        }}
      >
        <label className="sr-only" htmlFor="patient-ai-question">
          Ask about this patient
        </label>
        <textarea
          id="patient-ai-question"
          placeholder="Ask about this patient..."
          value={question}
          maxLength={3000}
          required
          onChange={(event) => setQuestion(event.target.value)}
          disabled={busy}
        />
        <Btn kind="dark" type="submit" disabled={busy || !question.trim()}>
          {busy ? "Thinking..." : "Send"}
        </Btn>
      </form>
      {error && (
        <p role="alert">
          {error} Your question has been kept so you can try again.
        </p>
      )}
    </div>
  );
}
function SharedHistory({
  connectionId,
  categories,
  onDenied,
}: {
  connectionId: string;
  categories: string[];
  onDenied: () => void;
}) {
  const [items, setItems] = useState<DisplayRecord[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [filter, setFilter] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(
    async (selected: string, after?: string) => {
      const serial = ++sequence.current;
      setBusy(true);
      setError("");
      try {
        const result = await api<{
          items: DisplayRecord[];
          nextCursor: string | null;
        }>(
          `/api/practitioner/workspace?connection=${connectionId}&view=timeline${selected ? `&category=${encodeURIComponent(selected)}` : ""}${after ? `&cursor=${encodeURIComponent(after)}` : ""}`,
        );
        if (serial === sequence.current) {
          setItems((old) => (after ? [...old, ...result.items] : result.items));
          setCursor(result.nextCursor);
        }
      } catch (e) {
        if (serial === sequence.current) {
          setItems([]);
          setCursor(null);
          setError(errorMessage(e));
          onDenied();
        }
      } finally {
        if (serial === sequence.current) setBusy(false);
      }
    },
    [connectionId, onDenied],
  );
  useEffect(() => {
    let active = true;
    const serial = ++sequence.current;
    api<{ items: DisplayRecord[]; nextCursor: string | null }>(
      `/api/practitioner/workspace?connection=${connectionId}&view=timeline`,
    )
      .then((result) => {
        if (active && serial === sequence.current) {
          setItems(result.items);
          setCursor(result.nextCursor);
          setBusy(false);
        }
      })
      .catch((e) => {
        if (active && serial === sequence.current) {
          setItems([]);
          setError(errorMessage(e));
          setBusy(false);
          onDenied();
        }
      });
    return () => {
      active = false;
    };
  }, [connectionId, onDenied]);
  return (
    <>
      <label className="patient-history-filter">
        Record category
        <select
          value={filter}
          disabled={busy}
          onChange={(event) => {
            setFilter(event.target.value);
            void load(event.target.value);
          }}
        >
          <option value="">All shared categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {recordLabels[cat] ?? cat}
            </option>
          ))}
        </select>
      </label>
      {items.map((record) => (
        <ClinicalRecord key={record.id} record={record} />
      ))}
      {!busy && !items.length && !error && (
        <p>No finalized records shared in this category.</p>
      )}
      {busy && <p role="status">Loading shared history...</p>}
      {error && <p role="alert">{error}</p>}
      {cursor && (
        <Btn disabled={busy} onClick={() => void load(filter, cursor)}>
          Load more records
        </Btn>
      )}
    </>
  );
}
const titles: Record<Panel, string> = {
  summary: "Health summary",
  ai: "Ask Mhistree",
  work: "Care notes",
  requests: "Requests & results",
  messages: "Care inbox",
};
export function PatientDetailView({ connectionId }: { connectionId: string }) {
  const [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [panel, setPanel] = useState<Panel | null>(null);
  const trigger = useRef<HTMLElement | null>(null),
    sequence = useRef(0),
    revision = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    const serial = ++sequence.current;
    try {
      const result = await api<Detail>(
        `/api/practitioner/workspace?connection=${connectionId}`,
      );
      if (serial !== sequence.current) return;
      if (revision.current !== null && revision.current !== result.revision)
        setPanel(null);
      revision.current = result.revision;
      setData(result);
      setError("");
    } catch (e) {
      if (serial === sequence.current) {
        setData(null);
        setPanel(null);
        setError(errorMessage(e));
      }
    }
  }, [connectionId]);
  useEffect(() => {
    let active = true;
    const serial = ++sequence.current;
    api<Detail>(`/api/practitioner/workspace?connection=${connectionId}`)
      .then((result) => {
        if (active && serial === sequence.current) {
          revision.current = result.revision;
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (active && serial === sequence.current) {
          setData(null);
          setPanel(null);
          setError(errorMessage(e));
        }
      });
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh, connectionId]);
  function tile(value: Panel, icon: IconName, description: string) {
    return (
      <button
        type="button"
        className="card patient-section-tile"
        key={value}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setPanel(value);
        }}
      >
        <span className="patient-tile-icon">
          <Icon n={icon} s={24} />
        </span>
        <div>
          <h2>{titles[value]}</h2>
          <p>{description}</p>
        </div>
        <Icon n="chevronRight" />
      </button>
    );
  }
  return (
    <section className="patient-page patient-detail-page">
      <MobileTopbarActions>
        <Btn asChild sm icon="arrowLeft">
          <Link href="/clinician/patients">Back to My patients</Link>
        </Btn>
      </MobileTopbarActions>
      <div className="patient-detail-toolbar">
        <Btn asChild icon="arrowLeft" className="patient-detail-back">
          <Link href="/clinician/patients">Back to My patients</Link>
        </Btn>
        <div className="patient-detail-actions">
          <span className="patient-detail-refresh">
            <Btn onClick={() => void refresh()}>Refresh</Btn>
          </span>
        </div>
      </div>
      {!data ? (
        <div className="card patient-detail-empty">
          <h1>Patient details</h1>
          <p role={error ? "alert" : "status"}>
            {error || "Loading currently shared records..."}
          </p>
          {error && <Btn onClick={() => void refresh()}>Retry</Btn>}
        </div>
      ) : (
        <>
          <div className="patient-profile-folder">
            <div
              className="patient-folder-tab"
              role="group"
              aria-label="Patient record tools"
            >
              <PatientActionButton
                icon="pulse"
                label={titles.summary}
                onClick={(event) => {
                  trigger.current = event.currentTarget;
                  setPanel("summary");
                }}
              />
              {(data.permissions.read.includes("result") ||
                data.requests.length > 0) && (
                <PatientActionButton
                  icon="doc"
                  label={titles.requests}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setPanel("requests");
                  }}
                />
              )}
            </div>
            <article className="card patient-profile-card">
              <header className="patient-identity-card">
                {(data.permissions.write.length > 0 ||
                  data.work.length > 0) && (
                  <PatientActionButton
                    icon="edit"
                    label={titles.work}
                    onClick={(event) => {
                      trigger.current = event.currentTarget;
                      setPanel("work");
                    }}
                  />
                )}
                <span
                  className="sharing-avatar patient-detail-avatar"
                  aria-hidden="true"
                >
                  {data.patient.display_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")}
                </span>
                <div className="patient-identity-main">
                  <p className="patient-detail-eyebrow">Direct connection</p>
                  <h1>{data.patient.display_name}</h1>
                  <dl>
                    <div>
                      <dt>Date of birth</dt>
                      <dd>
                        {data.patient.birth_date
                          ? new Date(
                              data.patient.birth_date,
                            ).toLocaleDateString("en-GB", {
                              timeZone: "Africa/Lagos",
                            })
                          : "Not recorded"}
                      </dd>
                    </div>
                    {data.patient.mhistree_id && (
                      <div>
                        <dt>Mhistree ID</dt>
                        <dd>{data.patient.mhistree_id}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </header>
              <div className="patient-detail-overview">
                <PatientSnapshot overview={data.overview} summaryOnly />
              </div>
            </article>
          </div>
          <div className="patient-section-grid">
            {tile(
              "ai",
              "spark",
              "Ask questions about this patient's authorized records.",
            )}
            {data.messages !== null &&
              tile(
                "messages",
                "chat",
                "Communicate with this patient, separately from AI chat.",
              )}
          </div>
          {panel && (
            <SidePanel
              title={titles[panel]}
              description={data.patient.display_name}
              className="patient-detail-panel"
              onClose={() => setPanel(null)}
              returnFocus={() => trigger.current}
            >
              <div className="sharing-panel-body patient-detail-panel-body">
                {panel === "summary" && (
                  <>
                    <p className="sharing-help">
                      A bounded view of currently shared records. A missing item
                      does not establish that a condition or medication is
                      absent.
                    </p>
                    {data.overview.summary.map((item) => (
                      <article
                        className="patient-clinical-record"
                        key={item.id}
                      >
                        <small>
                          {sourceLabels[item.sourceStatus] ?? item.sourceStatus}{" "}
                          · {item.status}
                        </small>
                        <p>{item.text}</p>
                        <small>
                          Recorded{" "}
                          {new Date(item.recordedAt).toLocaleDateString(
                            "en-GB",
                            { timeZone: "Africa/Lagos" },
                          )}
                        </small>
                      </article>
                    ))}
                    {!data.overview.summary.length && (
                      <p>No finalized reports shared yet.</p>
                    )}
                    {(data.permissions.read.includes("medication-use") ||
                      data.permissions.read.includes("prescription")) && (
                      <section
                        className="patient-summary-medications"
                        aria-label="Medications and prescriptions"
                      >
                        {data.permissions.read.includes("medication-use") && (
                          <>
                            <h3>Reported medication use</h3>
                            <p className="sharing-help">
                              Last-known reports retain their dates and
                              uncertainty. A prescription does not prove current
                              use.
                            </p>
                            {data.state
                              .filter((r) => r.category === "medication-use")
                              .map((record) => (
                                <ClinicalRecord
                                  key={record.id}
                                  record={record}
                                />
                              ))}
                            {!data.state.some(
                              (r) => r.category === "medication-use",
                            ) && <p>No medication-use records shared.</p>}
                          </>
                        )}
                        {data.permissions.read.includes("prescription") && (
                          <>
                            <h3>Professional prescriptions</h3>
                            {data.overview.prescriptions.map((item) => (
                              <article
                                className="patient-clinical-record"
                                key={item.id}
                              >
                                <p>{item.text}</p>
                                <small>
                                  Recorded{" "}
                                  {new Date(item.recordedAt).toLocaleDateString(
                                    "en-GB",
                                    { timeZone: "Africa/Lagos" },
                                  )}
                                </small>
                              </article>
                            ))}
                            {!data.overview.prescriptions.length && (
                              <p>No prescriptions shared.</p>
                            )}
                          </>
                        )}
                        <p className="sharing-help">
                          Older prescriptions and medication history are
                          available in Shared history below.
                        </p>
                      </section>
                    )}
                    <section
                      className="patient-summary-history"
                      aria-label="Shared history"
                    >
                      <h3>Shared history</h3>
                      <SharedHistory
                        connectionId={connectionId}
                        categories={data.permissions.read}
                        onDenied={refresh}
                      />
                    </section>
                    <PatientAssistant connectionId={connectionId} summary />
                  </>
                )}
                {panel === "ai" && (
                  <PatientAssistant
                    key={data.revision}
                    connectionId={connectionId}
                  />
                )}
                {(panel === "work" ||
                  panel === "requests" ||
                  panel === "messages") && (
                  <WorkspaceView connectionId={connectionId} section={panel} />
                )}
              </div>
            </SidePanel>
          )}
        </>
      )}
    </section>
  );
}
