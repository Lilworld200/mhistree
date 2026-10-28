"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PatientAssistant } from "./patient-assistant";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/client-api";
import { useCareNotifications } from "./notification-context";
import type { ActingContext } from "@/features/access/server";
import {
  recordNarrative,
  type NarrativeBody,
} from "@/features/health-records/narrative";
import {
  EventTime,
  type DisplayRecord,
} from "@/features/health-records/timeline-view";
type Entry = {
  id: string;
  logical_id: string;
  version: number;
  category: string;
  body: NarrativeBody;
  source_spans?: string[];
  status: string;
  source_status: string;
  author_account_id: string;
  recorded_at: string;
  occurred_at?: DisplayRecord["occurred_at"];
};
type Work = {
  id: string;
  kind: string;
  category: string;
  state: string;
  version: number;
  body: { text: string };
  ai_provenance: unknown;
};
type RequestRow = {
  id: string;
  service_name: string;
  state: string;
  version: number;
  result_work_id: string | null;
  result_event_id: string | null;
};
export type Workspace = {
  permissions?: { read: string[]; write: string[] };
  patientPersonId: string;
  revision: number;
  state: Entry[];
  recent: Entry[];
  work: Work[];
  requests: RequestRow[];
  messages: {
    items: {
      id: string;
      content: string;
      sent_at: string;
      delivery_state: string;
      author_account_id?: string;
      own?: boolean;
      recommendations?: {
        id: string;
        name: string;
        state: string;
        version: number;
      }[];
      clinical_attachments?: { eventId: string; text: string }[];
      sequence?: string;
      summary_attachment?: { text: string } | null;
    }[];
  } | null;
  notifications?: { health: boolean; messages: boolean; ai: boolean };
  handoverSummary?: string | null;
};
export function WorkspaceView({
  connectionId,
  organizationContext,
  section = "all",
  controller,
}: {
  connectionId: string;
  organizationContext?: ActingContext;
  section?: "all" | "work" | "requests" | "messages";
  controller?: {
    data: Workspace | null;
    ready: boolean;
    refresh: () => Promise<void>;
    clear: () => void;
  };
}) {
  const [reviewMessage, setReviewMessage] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [noteDestination, setNoteDestination] = useState<"note" | "record">(
    "note",
  );
  const endpoint = organizationContext
    ? "/api/organizations/workspace"
    : "/api/practitioner/workspace";
  const query = organizationContext
    ? `context=${encodeURIComponent(JSON.stringify(organizationContext))}`
    : `connection=${connectionId}`;
  const [localData, setData] = useState<Workspace | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [suggestion, setSuggestion] = useState<{
      id: string;
      text: string;
      limitations: string[];
      evidenceIds: string[];
    } | null>(null);
  const refresh = useCallback(async () => {
    if (controller) return controller.refresh();
    try {
      setData(await api<Workspace>(`${endpoint}?${query}`));
    } catch (e) {
      setData(null);
      setSuggestion(null);
      setMessage(errorMessage(e));
    }
  }, [endpoint, query, controller]);
  useEffect(() => {
    if (controller) return;
    let active = true;
    api<Workspace>(`${endpoint}?${query}`)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error) => {
        if (active) {
          setData(null);
          setSuggestion(null);
          setMessage(errorMessage(error));
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
  }, [refresh, endpoint, query, controller]);
  const [patientOnline, setPatientOnline] = useState(false);
  useEffect(() => {
    if (section !== "messages" || organizationContext?.kind === "initial-care")
      return;
    let alive = true,
      running = false;
    async function pulse() {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const result = await api<{ online: boolean }>(endpoint, {
          ...(organizationContext
            ? { context: organizationContext }
            : { connectionId }),
          action: "presence",
          data: {},
        });
        if (alive) setPatientOnline(result.online);
      } catch {
        if (alive) setPatientOnline(false);
      } finally {
        running = false;
      }
    }
    void pulse();
    const timer = setInterval(() => void pulse(), 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [section, organizationContext, connectionId, endpoint]);
  const data = controller
    ? controller.ready
      ? controller.data
      : null
    : localData;
  const { refresh: refreshNotifications } = useCareNotifications();
  const pendingOperations = useRef(new Map<string, string>());
  async function act(action: string, payload: unknown) {
    let operation: string | undefined;
    if (
      (action === "save" || action === "message") &&
      payload &&
      typeof payload === "object"
    ) {
      const body = payload as Record<string, unknown>;
      operation = JSON.stringify({ action, ...body, requestKey: undefined });
      const key =
        pendingOperations.current.get(operation) ?? crypto.randomUUID();
      pendingOperations.current.set(operation, key);
      payload = { ...body, requestKey: key };
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await api<unknown>(endpoint, {
        ...(organizationContext
          ? { context: organizationContext }
          : { connectionId }),
        action,
        data: payload,
      });
      if (operation) pendingOperations.current.delete(operation);
      await refresh();
      if (action === "read" || action === "message")
        await refreshNotifications();
      setMessage("Saved.");
      return result;
    } catch (e) {
      setMessage(errorMessage(e));
      if (
        e instanceof Error &&
        [
          "ACCESS_DENIED",
          "ACCESS_REVOKED",
          "AUTH_REQUIRED",
          "SESSION_RETIRED",
        ].includes(e.message)
      ) {
        setData(null);
        setSuggestion(null);
        controller?.clear();
      }
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="patient-page">
        <h1>Authorized patient record</h1>
        <p role="status">{message || "Loading current access…"}</p>
        <Btn onClick={() => void refresh()}>Retry</Btn>
      </section>
    );
  function records(rows: Entry[]) {
    return rows.map((e) => (
      <article className="record-card" key={e.id} id={`event-${e.id}`}>
        <strong>
          {e.category} · {e.source_status} · {e.status}
        </strong>
        <p>{recordNarrative(e)}</p>
        {e.occurred_at && (
          <p>
            <EventTime time={e.occurred_at} />
          </p>
        )}
        <p>
          Author {e.author_account_id} · Recorded:{" "}
          {new Date(e.recorded_at).toLocaleString()} · version {e.version}
        </p>
        <small>
          Record {e.id}; logical entry {e.logical_id}
        </small>
      </article>
    ));
  }
  return (
    <section className="patient-page">
      {section === "all" && (
        <>
          <h1>Patient workspace</h1>
          <p>
            Acting context:{" "}
            {organizationContext
              ? `${organizationContext.kind} ${"organizationId" in organizationContext ? organizationContext.organizationId : ""}`
              : `direct connection ${connectionId}`}{" "}
            · revision {data.revision}
          </p>
          <p>
            Only currently permitted records are shown. Access is rechecked on
            every action and while this view is open.
          </p>
          <p role="status">{message}</p>
          <h2>Persistent health details</h2>
          {records(data.state)}
          <h2>Recent finalized history</h2>
          {records(data.recent)}
        </>
      )}
      {section !== "all" && <p role="status">{message}</p>}
      {(section === "all" || section === "work") && (
        <>
          <h2 id="private-work">Care notes</h2>
          <p>
            Private work is not patient-facing. Suspected findings must remain
            labeled suspected. Finalization requires deliberate human review.
          </p>
          <nav className="sharing-tabs" aria-label="Care note destination">
            <Btn
              onClick={() => setNoteDestination("note")}
              aria-pressed={noteDestination === "note"}
            >
              Private note
            </Btn>
            {organizationContext?.kind !== "initial-care" && (
              <Btn
                onClick={() => setNoteDestination("record")}
                aria-pressed={noteDestination === "record"}
              >
                Add to patient record
              </Btn>
            )}
          </nav>
          {noteDestination === "record" ? (
            <PatientAssistant
              connectionId={connectionId}
              organizationContext={organizationContext}
              captureOnly
              writableCategories={data.permissions?.write ?? []}
              onSaved={() => void refresh()}
              onDenied={() => controller?.clear()}
            />
          ) : (
            <form
              className="account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await act("save", {
                  requestKey: crypto.randomUUID(),
                  patientPersonId: data.patientPersonId,
                  kind: f.get("kind"),
                  category: f.get("category"),
                  body: {
                    text: f.get("text"),
                    bodySite: f.get("bodySite") || null,
                    contextLinks: [],
                  },
                  occurredAt: f.get("eventDate")
                    ? {
                        precision: "exact",
                        at: new Date(String(f.get("eventDate"))).toISOString(),
                      }
                    : { precision: "unknown" },
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  dueAt: f.get("due")
                    ? new Date(String(f.get("due"))).toISOString()
                    : null,
                  ...(suggestion && f.get("useAi")
                    ? { aiRunId: suggestion.id }
                    : {}),
                });
              }}
            >
              <label>
                Type
                <select name="kind">
                  <option value="private-note">Author-only private note</option>
                  <option value="reminder">Author-only reminder</option>
                  <option value="draft">Clinical draft</option>
                </select>
              </label>
              <label>
                Category
                <select name="category">
                  {[
                    "clinical",
                    "allergy",
                    "medication-use",
                    "baseline",
                    "ongoing",
                    "prescription",
                    "result",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Content
                <textarea
                  name="text"
                  key={suggestion?.id ?? "manual"}
                  defaultValue={suggestion?.text ?? ""}
                  required
                  maxLength={10000}
                />
              </label>
              <label>
                Body site
                <input name="bodySite" />
              </label>
              <label>
                Exact event time, only if known
                <input type="datetime-local" name="eventDate" />
              </label>
              <label>
                Reminder time, if applicable
                <input type="datetime-local" name="due" />
              </label>
              {suggestion && (
                <label>
                  <input type="checkbox" name="useAi" />
                  Retain this AI suggestion’s provenance (draft or private note)
                </label>
              )}
              <Btn type="submit" disabled={busy}>
                Save private work
              </Btn>
            </form>
          )}
          {data.work.map((w) => (
            <article className="record-card" key={w.id}>
              <strong>
                {w.kind} · {w.category} · {w.state} · version {w.version}
              </strong>
              <p>{w.body.text}</p>
              <small>Work ID {w.id}</small>
              {w.ai_provenance ? (
                <p>AI-assisted work; human review required.</p>
              ) : null}
              {w.state === "paused" ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await act("edit", {
                      id: w.id,
                      version: w.version,
                      action: "resume",
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <label>
                    Review original dates and current authority
                    <textarea name="reason" minLength={10} required />
                  </label>
                  <Btn type="submit" disabled={busy}>
                    Review and resume
                  </Btn>
                </form>
              ) : (
                w.state === "draft" && (
                  <>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        await act("edit", {
                          id: w.id,
                          version: w.version,
                          action: "edit",
                          body: { ...w.body, text: f.get("text") },
                        });
                      }}
                    >
                      <label>
                        Edit private draft
                        <textarea
                          name="text"
                          defaultValue={w.body.text}
                          required
                        />
                      </label>
                      <Btn type="submit" disabled={busy}>
                        Save revision
                      </Btn>
                    </form>
                    {w.kind === "draft" && w.category !== "result" && (
                      <form
                        className="account-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await act("finalize", {
                            id: w.id,
                            version: w.version,
                            requestKey: crypto.randomUUID(),
                            reviewed: true,
                            status: f.get("status"),
                            ...(f.get("logicalId")
                              ? {
                                  correction: {
                                    logicalId: f.get("logicalId"),
                                    expectedVersion: Number(
                                      f.get("expectedVersion"),
                                    ),
                                  },
                                  correctionKind: f.get("correctionKind"),
                                  reason: f.get("reason"),
                                }
                              : {}),
                          });
                        }}
                      >
                        <label>
                          State
                          <select name="status">
                            {["unknown", "active", "resolved", "recurrent"].map(
                              (s) => (
                                <option key={s}>{s}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <details>
                          <summary>
                            Correct an existing entry instead of recording new
                            care
                          </summary>
                          <label>
                            Logical entry ID
                            <input name="logicalId" />
                          </label>
                          <label>
                            Expected version
                            <input
                              type="number"
                              name="expectedVersion"
                              min={1}
                            />
                          </label>
                          <label>
                            Correction kind
                            <select name="correctionKind">
                              <option>material</option>
                              <option>minor</option>
                            </select>
                          </label>
                          <label>
                            Correction reason
                            <textarea name="reason" />
                          </label>
                        </details>
                        <label>
                          <input type="checkbox" required />I reviewed this
                          entry and its evidence. Publish as my attributed
                          clinical contribution.
                        </label>
                        <Btn type="submit" disabled={busy}>
                          Finalize reviewed care
                        </Btn>
                      </form>
                    )}
                    <Btn
                      disabled={busy}
                      onClick={() =>
                        void act("edit", {
                          id: w.id,
                          version: w.version,
                          action: "cancel",
                          reason: "Author cancelled private work.",
                        })
                      }
                    >
                      Cancel private work
                    </Btn>
                  </>
                )
              )}
            </article>
          ))}
        </>
      )}
      {section === "all" && organizationContext?.kind !== "initial-care" && (
        <>
          <h2>Practitioner AI assistance</h2>
          <form
            className="account-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await act("ai", {
                question: f.get("question"),
                purpose: f.get("purpose"),
                includeOwnNotes: Boolean(f.get("notes")),
              });
              if (result) setSuggestion(result as typeof suggestion);
            }}
          >
            <label>
              Purpose
              <select name="purpose">
                <option>summary</option>
                <option>question</option>
                <option>assessment</option>
                <option>draft</option>
              </select>
            </label>
            <label>
              Question
              <textarea name="question" required />
            </label>
            <label>
              <input type="checkbox" name="notes" />
              Include only my private notes in this author workspace
            </label>
            <Btn type="submit" disabled={busy}>
              Generate suggestion
            </Btn>
          </form>
          {suggestion && (
            <article className="record-card">
              <strong>AI suggestion — not finalized care</strong>
              <p>{suggestion.text}</p>
              {suggestion.limitations.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
              <p>
                Evidence:{" "}
                {suggestion.evidenceIds.join(", ") ||
                  "No finalized evidence cited"}
              </p>
              <p>
                Edit the suggestion in the draft form above before saving or
                finalizing.
              </p>
            </article>
          )}
        </>
      )}
      {(section === "all" || section === "requests") &&
        organizationContext?.kind !== "initial-care" && (
          <>
            <h2 id="requests-results">Requests and results</h2>
            <p>
              Request a named service from a separately authorized recipient. A
              note is never an order.
            </p>
            <form
              className="account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await act("request", {
                  patientPersonId: data.patientPersonId,
                  recipientConnectionId: f.get("connection"),
                  recipientAccountId: f.get("recipient"),
                  serviceName: f.get("service"),
                  priority: f.get("priority"),
                  requestedFor: null,
                  authorizationBasis: f.get("basis"),
                  requestKey: crypto.randomUUID(),
                });
              }}
            >
              <label>
                Service/test
                <input name="service" required />
              </label>
              <label>
                Recipient’s authorized connection ID
                <input name="connection" required />
              </label>
              <label>
                Named recipient account ID
                <input name="recipient" required />
              </label>
              <label>
                Priority
                <select name="priority">
                  <option>routine</option>
                  <option>urgent</option>
                </select>
              </label>
              <label>
                Authorization basis
                <textarea name="basis" minLength={10} required />
              </label>
              <Btn type="submit" disabled={busy}>
                Create explicit request
              </Btn>
            </form>
            {data.requests.map((r) => (
              <article className="record-card" key={r.id}>
                <h3>{r.service_name}</h3>
                <p>
                  {r.state} · version {r.version}
                </p>
                <form
                  className="account-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await act("request-transition", {
                      id: r.id,
                      version: r.version,
                      action: f.get("action"),
                      ...(f.get("workId") ? { workId: f.get("workId") } : {}),
                      ...(f.get("reason") ? { reason: f.get("reason") } : {}),
                    });
                  }}
                >
                  <label>
                    Transition
                    <select name="action">
                      {[
                        "accepted",
                        "in-progress",
                        "performed",
                        "result-draft",
                        "correct-result",
                        "resume",
                        "cancelled",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Result draft ID (save a result draft above first)
                    <input name="workId" />
                  </label>
                  <label>
                    Review/correction/cancellation reason
                    <textarea name="reason" />
                  </label>
                  <Btn type="submit" disabled={busy}>
                    Apply authorized transition
                  </Btn>
                </form>
                {r.state === "result-draft" && (
                  <form
                    className="account-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const w = data.work.find(
                        (w) => w.id === r.result_work_id,
                      );
                      if (!w) {
                        setMessage(
                          "Open the authorized recipient workspace and resume the result draft first.",
                        );
                        return;
                      }
                      const prior = data.recent.find(
                        (ev) => ev.id === r.result_event_id,
                      );
                      await act("result", {
                        requestId: r.id,
                        version: r.version,
                        entry: {
                          id: w.id,
                          version: w.version,
                          requestKey: crypto.randomUUID(),
                          reviewed: true,
                          status: "unknown",
                          ...(prior
                            ? {
                                correction: {
                                  logicalId: prior.logical_id,
                                  expectedVersion: prior.version,
                                },
                                correctionKind: "material",
                                reason: f.get("reason"),
                              }
                            : {}),
                        },
                      });
                    }}
                  >
                    <label>
                      Correction reason, when correcting
                      <textarea name="reason" />
                    </label>
                    <label>
                      <input type="checkbox" required />I reviewed the result
                      and authorize publication under my identity.
                    </label>
                    <Btn type="submit" disabled={busy}>
                      Finalize result
                    </Btn>
                  </form>
                )}
              </article>
            ))}
          </>
        )}
      {(section === "all" || section === "messages") &&
        organizationContext?.kind !== "initial-care" && (
          <>
            <h2 id="care-text-inbox">Care text inbox</h2>
            {patientOnline && (
              <p>Patient online · You can exchange direct care messages.</p>
            )}
            <p>
              Separate from AI chat. Stored delivery does not mean the patient
              has read or acted on a message.
            </p>
            {data.handoverSummary && (
              <div
                className="card handover-summary-card"
                style={{
                  marginBottom: "16px",
                  borderLeft: "4px solid var(--accent, #3b82f6)",
                  padding: "12px 16px",
                  background: "var(--card-subtle, rgba(59, 130, 246, 0.05))",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 6px 0",
                    fontSize: "14px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Icon n="spark" s={16} /> Patient Summary from AI
                </h3>
                <p
                  style={{ margin: 0, fontSize: "13px", color: "var(--ink2)" }}
                >
                  {data.handoverSummary}
                </p>
                <small
                  style={{
                    display: "block",
                    marginTop: "6px",
                    color: "var(--ink3)",
                    fontSize: "11px",
                  }}
                >
                  Clinical summary only. Raw patient-AI chat remains private to
                  the patient.
                </small>
              </div>
            )}
            {data.messages?.items.map((m) => (
              <article className="record-card" key={m.id}>
                <p>{m.content}</p>
                {m.clinical_attachments?.map((attachment) => (
                  <aside key={attachment.eventId}>
                    <strong>Reviewed patient-record entry</strong>
                    <p>{attachment.text}</p>
                  </aside>
                ))}
                {m.own &&
                  data.permissions?.write.includes("prescription") &&
                  m.recommendations
                    ?.filter((r) => ["pending", "planned"].includes(r.state))
                    .map((r) => (
                      <Btn
                        key={r.id}
                        sm
                        disabled={busy}
                        onClick={() =>
                          void act("recommendation-withdraw", {
                            id: r.id,
                            version: r.version,
                          })
                        }
                      >
                        Withdraw {r.name} initiation follow-ups
                      </Btn>
                    ))}
                {m.own && (
                  <Btn sm onClick={() => setReviewMessage(m)}>
                    Review findings for patient record
                  </Btn>
                )}
                {m.summary_attachment && (
                  <aside aria-label="Patient shared summary">
                    <h4>Patient reviewed summary</h4>
                    <p>{m.summary_attachment.text}</p>
                  </aside>
                )}
                <small>
                  {new Date(m.sent_at).toLocaleString()} · {m.delivery_state}
                </small>
              </article>
            ))}
            {reviewMessage && (
              <section aria-label="Review care message findings">
                <h3>Review findings</h3>
                <PatientAssistant
                  key={reviewMessage.id}
                  connectionId={connectionId}
                  organizationContext={organizationContext}
                  captureOnly
                  initialQuestion={reviewMessage.content}
                  originCareMessageId={reviewMessage.id}
                  writableCategories={data.permissions?.write ?? []}
                  onSaved={() => void refresh()}
                  onDenied={() => controller?.clear()}
                />
                <Btn onClick={() => setReviewMessage(null)}>Close review</Btn>
              </section>
            )}
            <form
              className="account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await act("message", {
                  connectionId,
                  requestKey: crypto.randomUUID(),
                  content: f.get("content"),
                  replyToMessageId: data.messages?.items.at(-1)?.id,
                  ...(f.get("recommendationReviewed")
                    ? {
                        recommendation: {
                          name: f.get("medicineName"),
                          details: f.get("medicineDetails"),
                          reviewed: true,
                        },
                      }
                    : {}),
                });
              }}
            >
              <label>
                Message
                <textarea name="content" required />
              </label>
              <details>
                <summary>Medication recommendation</summary>
                <p>
                  Records a reviewed recommendation only. Sending does not
                  finalize a prescription or establish actual use. Include the
                  exact name and details in your message.
                </p>
                <label>
                  Exact medicine name
                  <input name="medicineName" maxLength={200} />
                </label>
                <label>
                  Recommendation details
                  <input name="medicineDetails" maxLength={2000} />
                </label>
                <label>
                  <input type="checkbox" name="recommendationReviewed" />I
                  reviewed this recommendation
                </label>
              </details>
              <Btn type="submit" disabled={busy}>
                Send care message
              </Btn>
            </form>
            <Btn
              disabled={busy || !data.messages?.items.at(-1)?.sequence}
              onClick={() =>
                void act("read", {
                  throughSequence: data.messages?.items.at(-1)?.sequence,
                })
              }
            >
              Mark displayed thread read
            </Btn>
          </>
        )}
    </section>
  );
}
