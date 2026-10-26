"use client";
import { PatientAssistant } from "./patient-assistant";
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
import { WorkspaceView, type Workspace } from "./workspace-view";
import { usePatientWorkspace } from "./use-patient-workspace";
import { PatientSnapshot } from "./patient-snapshot";
import type { PatientOverview } from "./patient-types";
export type Detail = Omit<Workspace, "state" | "recent"> & {
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
  capabilities?: { work: boolean; requests: boolean; messages: boolean };
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
export function PatientDetailView({
  connectionId,
  initialData,
}: {
  connectionId: string;
  initialData?: Detail;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const view =
    panel === "work" || panel === "requests" || panel === "messages"
      ? panel
      : "profile";
  const { data, error, refresh, loadedView, clear } =
    usePatientWorkspace<Detail>(connectionId, view, initialData, () =>
      setPanel(null),
    );
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
              {(data.capabilities?.requests ??
                (data.permissions.read.includes("result") ||
                  data.requests.length > 0)) && (
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
                {(data.capabilities?.work ??
                  (data.permissions.write.length > 0 ||
                    data.work.length > 0)) && (
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
              "Explore shared records and, when permitted, review and save care or private notes.",
            )}
            {(data.capabilities?.messages ?? data.messages !== null) &&
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
                    <PatientAssistant
                      connectionId={connectionId}
                      summary
                      writableCategories={data.permissions.write}
                      onSaved={refresh}
                      onDenied={refresh}
                    />
                  </>
                )}
                {panel === "ai" && (
                  <PatientAssistant
                    key={data.revision}
                    connectionId={connectionId}
                    writableCategories={data.permissions.write}
                    onSaved={refresh}
                    onDenied={refresh}
                  />
                )}
                {(panel === "work" ||
                  panel === "requests" ||
                  panel === "messages") && (
                  <WorkspaceView
                    connectionId={connectionId}
                    section={panel}
                    controller={{
                      data,
                      ready: loadedView === panel,
                      refresh,
                      clear,
                    }}
                  />
                )}
              </div>
            </SidePanel>
          )}
        </>
      )}
    </section>
  );
}
