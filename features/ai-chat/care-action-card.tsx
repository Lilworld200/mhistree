"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { careDraft } from "./care-action-schema";
import type {
  CareDraft,
  CareOptions,
  CareProposal,
  SelectedRecipient,
} from "./care-action-schema";

const pendingDrafts = new Map<string, CareDraft>();
let unloadGuardInstalled = false;
function selected(draft: CareDraft): SelectedRecipient[] {
  return (
    draft.recipients ??
    (draft.connectionId && draft.practitionerId && draft.connectionRevision
      ? [
          {
            connectionId: draft.connectionId,
            practitionerId: draft.practitionerId,
            connectionRevision: draft.connectionRevision,
          },
        ]
      : [])
  );
}
function withRecipients(
  draft: CareDraft,
  recipients: SelectedRecipient[],
): CareDraft {
  const first = recipients[0];
  return {
    ...draft,
    recipients,
    connectionId: first?.connectionId ?? null,
    practitionerId: first?.practitionerId ?? null,
    connectionRevision: first?.connectionRevision ?? null,
    slot: null,
  };
}
export function CareActionCard({
  proposal,
  active = true,
  onConfirmationChange,
}: {
  proposal: CareProposal;
  active?: boolean;
  onConfirmationChange?: (id: string | null) => void;
}) {
  const [saved, setSaved] = useState(proposal),
    [draft, setDraft] = useState(
      () => pendingDrafts.get(proposal.id) ?? proposal.payload,
    );
  const [options, setOptions] = useState<CareOptions | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false);
  const [summaryState, setSummaryState] = useState<
    "pending" | "ready" | "failed"
  >(
    proposal.conversationId &&
      proposal.kind === "message" &&
      proposal.state === "draft" &&
      proposal.payload.summary === undefined
      ? "pending"
      : "ready",
  );
  const prepareSummaryRef = useRef<() => Promise<void>>(async () => {});
  const [confirmation, setConfirmation] =
    useState<CareProposal["confirmation"]>(null);
  useEffect(() => {
    onConfirmationChange?.(active ? (confirmation?.id ?? null) : null);
    return () => onConfirmationChange?.(null);
  }, [active, confirmation, onConfirmationChange]);
  const current = useRef(proposal),
    latest = useRef(draft),
    mounted = useRef(true),
    queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    flushRef = useRef<() => Promise<void>>(async () => {});
  // Typed Send updates history outside this component; accept its newer server receipt.
  useEffect(() => {
    let alive = true;
    if (
      proposal.version > current.current.version ||
      (proposal.version === current.current.version &&
        proposal.state !== current.current.state)
    ) {
      queueMicrotask(() => {
        if (!alive) return;
        if (pendingDrafts.has(proposal.id)) {
          setError(
            "This draft changed in another tab. Your text is retained; review the saved draft before sending.",
          );
          return;
        }
        current.current = proposal;
        latest.current = proposal.payload;
        setSaved(proposal);
        setDraft(proposal.payload);
        setConfirmation(null);
      });
    }
    return () => {
      alive = false;
    };
  }, [proposal]);
  const writable = saved.state === "draft";
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    const pending = queue.current
      .catch(() => {})
      .then(async () => {
        const body = careDraft.parse(structuredClone(latest.current));
        if (
          ["completed", "dismissed", "sending"].includes(
            current.current.state,
          ) ||
          JSON.stringify(body) ===
            JSON.stringify(careDraft.parse(current.current.payload))
        )
          return;
        if (mounted.current) setSaving(true);
        try {
          const result = await api<CareProposal>("/api/chat/care-actions", {
            action: "update",
            id: proposal.id,
            version: current.current.version,
            payload: body,
          });
          current.current = result;
          if (
            JSON.stringify(body) ===
            JSON.stringify(careDraft.parse(latest.current))
          )
            pendingDrafts.delete(proposal.id);
          if (mounted.current) {
            setSaved(result);
            setConfirmation(null);
          }
        } finally {
          if (mounted.current) setSaving(false);
        }
      });
    queue.current = pending;
    return pending;
  }
  useEffect(() => {
    flushRef.current = flush;
  });
  function edit(body: CareDraft) {
    onConfirmationChange?.(null);
    latest.current = body;
    pendingDrafts.set(proposal.id, body);
    setDraft(body);
    setConfirmation(null);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch((e) => setError(errorMessage(e)));
    }, 500);
  }
  async function refresh(replace = false) {
    setLoading(true);
    setError("");
    try {
      const result = await api<{
        proposal: CareProposal;
        options: CareOptions;
      }>(`/api/chat/care-actions?id=${proposal.id}`);
      if (!mounted.current) return;
      setOptions(result.options);
      if (result.proposal.version !== current.current.version || replace) {
        if (
          !replace &&
          JSON.stringify(latest.current) !==
            JSON.stringify(current.current.payload)
        )
          setError(
            "This draft changed in another tab. Your text is retained; review the saved draft before sending.",
          );
        else {
          current.current = result.proposal;
          latest.current = result.proposal.payload;
          pendingDrafts.delete(proposal.id);
          setSaved(result.proposal);
          setDraft(result.proposal.payload);
        }
      }
    } catch (e) {
      if (mounted.current) setError(errorMessage(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    let alive = true;
    if (!unloadGuardInstalled) {
      window.addEventListener("beforeunload", (e) => {
        if (pendingDrafts.size) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
      unloadGuardInstalled = true;
    }
    queueMicrotask(() => {
      if (alive) void refresh();
    });
    return () => {
      alive = false;
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      void flushRef.current().catch(() => {});
    };
    // An owned proposal is stable across history refreshes; local edits are preserved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal.id]);

  const targets = selected(draft);
  const hasEligible = targets.some((s) =>
    options?.recipients.some(
      (r) =>
        r.connectionId === s.connectionId &&
        r.practitionerId === s.practitionerId &&
        r.revision === s.connectionRevision,
    ),
  );
  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      if (
        !active ||
        summaryState !== "ready" ||
        saved.kind !== "message" ||
        !["draft", "partial", "failed"].includes(saved.state) ||
        !hasEligible ||
        !draft.content.trim() ||
        saving ||
        busy ||
        !careDraft.safeParse(draft).success ||
        JSON.stringify(careDraft.parse(draft)) !==
          JSON.stringify(careDraft.parse(saved.payload))
      )
        return;
      void api<CareProposal>("/api/chat/care-actions", {
        action: "arm",
        id: proposal.id,
        version: saved.version,
      })
        .then((result) => {
          if (alive && mounted.current) setConfirmation(result.confirmation);
        })
        .catch((e) => {
          if (alive && mounted.current) setError(errorMessage(e));
        });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [
    active,
    summaryState,
    saved.kind,
    saved.state,
    saved.version,
    saved.payload,
    hasEligible,
    draft,
    saving,
    busy,
    proposal.id,
  ]);

  async function prepareSummary() {
    if (!proposal.conversationId) return;
    setSummaryState("pending");
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        state: string;
        attachment: CareDraft["summary"];
      }>("/api/chat", {
        action: "prepare-handoff",
        data: { id: proposal.conversationId },
      });
      if (result.state !== "ready")
        throw new Error("Summary preparation is running. Retry shortly.");
      edit({ ...latest.current, summary: result.attachment });
      await flush();
      setSummaryState("ready");
    } catch (e) {
      setSummaryState("failed");
      setError(
        `${errorMessage(e)} Your draft is retained. Retry summary preparation or send without an attachment.`,
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    prepareSummaryRef.current = prepareSummary;
  });
  useEffect(() => {
    if (
      proposal.conversationId &&
      proposal.kind === "message" &&
      proposal.state === "draft" &&
      proposal.payload.summary === undefined
    )
      void prepareSummaryRef.current();
  }, [
    proposal.id,
    proposal.conversationId,
    proposal.kind,
    proposal.state,
    proposal.payload.summary,
  ]);
  useEffect(() => {
    if (!active)
      void api("/api/chat/care-actions", {
        action: "disarm",
        id: proposal.id,
        version: saved.version,
      }).catch(() => {});
  }, [active, proposal.id, saved.version]);
  async function submit(action: "confirm" | "dismiss") {
    if (action === "confirm" && summaryState !== "ready") return;
    setBusy(true);
    setError("");
    try {
      await flush();
      const result = await api<CareProposal>("/api/chat/care-actions", {
        action,
        id: proposal.id,
        version: current.current.version,
      });
      current.current = result;
      setSaved(result);
      setConfirmation(null);
      pendingDrafts.delete(proposal.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reloadSaved() {
    if (
      JSON.stringify(latest.current) !==
        JSON.stringify(current.current.payload) &&
      !window.confirm("Replace your unsaved changes with the saved draft?")
    )
      return;
    await refresh(true);
  }
  const appointmentRecipient = options?.recipients.find(
    (r) =>
      r.connectionId === draft.connectionId &&
      r.practitionerId === draft.practitionerId &&
      r.revision === draft.connectionRevision,
  );
  const slotIndex =
    options?.slots.findIndex(
      (s) =>
        s.practitionerId === draft.practitionerId &&
        s.startsAt === draft.slot?.startsAt &&
        s.endsAt === draft.slot?.endsAt &&
        s.timezone === draft.slot?.timezone,
    ) ?? -1;
  const sent =
    saved.deliveries?.filter((d) => d.state === "stored").length ?? 0;
  const failed =
    saved.deliveries?.filter((d) => d.state !== "stored").length ?? 0;
  const finished = ["completed", "dismissed"].includes(saved.state);
  const title =
    saved.kind === "message"
      ? "Review care message"
      : "Review appointment request";
  return (
    <section className="chat-care-action" aria-label={title}>
      <strong>{title}</strong>
      {saved.deliveries?.length ? (
        <ul className="care-delivery-results" aria-label="Delivery results">
          {saved.deliveries.map((d, i) => (
            <li key={d.connectionId}>
              {options?.recipients.find(
                (r) => r.connectionId === d.connectionId,
              )?.name ?? `Selected care destination ${i + 1}`}
              :{" "}
              {d.state === "stored"
                ? "Saved to Care inbox"
                : d.state === "failed"
                  ? "Not saved — review and retry"
                  : "Pending"}
            </li>
          ))}
        </ul>
      ) : null}
      {saved.state === "completed" ? (
        <p role="status">
          {saved.kind === "message"
            ? "Message saved to Care inbox. This does not mean it has been read."
            : "Appointment requested. Awaiting practitioner acceptance."}{" "}
          <Link href={saved.kind === "message" ? "/inbox" : "/appointments"}>
            View {saved.kind === "message" ? "Care inbox" : "appointments"}
          </Link>
        </p>
      ) : saved.state === "dismissed" ? (
        <p>
          {sent
            ? "Further sending cancelled. Previously saved copies remain in Care inbox."
            : "Draft dismissed. Nothing was sent."}
        </p>
      ) : (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("confirm");
          }}
        >
          <p>
            Review the message and selected recipients. Separate care teams
            receive separate copies.
          </p>
          {saved.kind === "message" && (
            <section aria-label="Reviewed summary attachment">
              <Btn
                type="button"
                disabled={busy || !writable || !proposal.conversationId}
                onClick={() => void prepareSummary()}
              >
                {summaryState === "pending"
                  ? "Preparing summary…"
                  : "Prepare / refresh summary"}
              </Btn>
              {summaryState === "failed" && (
                <Btn
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    edit({ ...latest.current, summary: null });
                    setSummaryState("ready");
                  }}
                >
                  Send without a summary attachment
                </Btn>
              )}
              {draft.summary ? (
                <>
                  <label>
                    Review summary before sharing
                    <textarea
                      value={draft.summary.text}
                      maxLength={6000}
                      disabled={busy || !writable}
                      onChange={(e) =>
                        edit({
                          ...latest.current,
                          summary: { ...draft.summary!, text: e.target.value },
                        })
                      }
                    />
                  </label>
                  <Btn
                    type="button"
                    disabled={busy || !writable}
                    onClick={() => edit({ ...latest.current, summary: null })}
                  >
                    Remove attachment
                  </Btn>
                </>
              ) : (
                <p>
                  No summary attached. Send shares only the reviewed message.
                </p>
              )}
            </section>
          )}
          <fieldset
            className="care-recipient-list"
            disabled={busy || loading || saved.state === "sending"}
          >
            <legend>
              {saved.kind === "message"
                ? "Select practitioners"
                : "Select one practitioner"}
            </legend>
            {options?.recipients.map((r) => {
              const checked = targets.some(
                (s) =>
                  s.connectionId === r.connectionId &&
                  s.practitionerId === r.practitionerId,
              );
              const delivered = saved.deliveries?.some(
                (d) =>
                  d.connectionId === r.connectionId && d.state === "stored",
              );
              const attempted = saved.deliveries?.some(
                (d) => d.connectionId === r.connectionId,
              );
              return (
                <label
                  className="care-recipient-card"
                  key={`${r.connectionId}:${r.practitionerId}`}
                >
                  <input
                    type={saved.kind === "message" ? "checkbox" : "radio"}
                    name={`recipient-${proposal.id}`}
                    aria-label={r.name}
                    checked={checked}
                    disabled={delivered || (!writable && !attempted)}
                    onChange={(e) => {
                      const target = {
                        connectionId: r.connectionId,
                        practitionerId: r.practitionerId,
                        connectionRevision: r.revision,
                      };
                      const next =
                        saved.kind === "appointment"
                          ? [target]
                          : e.target.checked
                            ? [
                                ...targets.filter(
                                  (s) =>
                                    !(
                                      s.connectionId === r.connectionId &&
                                      s.practitionerId === r.practitionerId
                                    ),
                                ),
                                target,
                              ]
                            : targets.filter(
                                (s) =>
                                  !(
                                    s.connectionId === r.connectionId &&
                                    s.practitionerId === r.practitionerId
                                  ),
                              );
                      edit(withRecipients(latest.current, next));
                    }}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.kind === "organization"
                        ? "Shared organization care-team inbox"
                        : "Direct practitioner"}
                      {delivered ? " · Already saved" : ""}
                    </small>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {targets.some(
            (s) =>
              !options?.recipients.some(
                (r) =>
                  r.connectionId === s.connectionId &&
                  r.practitionerId === s.practitionerId,
              ),
          ) && (
            <p>
              A previous selection is no longer eligible. Other eligible
              selected destinations can still receive your message.{" "}
              <Btn
                sm
                type="button"
                disabled={busy}
                onClick={() =>
                  edit(
                    withRecipients(
                      latest.current,
                      targets.filter((s) =>
                        options?.recipients.some(
                          (r) =>
                            r.connectionId === s.connectionId &&
                            r.practitionerId === s.practitionerId,
                        ),
                      ),
                    ),
                  )
                }
              >
                Clear unavailable selections
              </Btn>
            </p>
          )}
          {targets.some(
            (s) =>
              options?.recipients.find(
                (r) =>
                  r.connectionId === s.connectionId &&
                  r.practitionerId === s.practitionerId,
              )?.kind === "organization",
          ) && (
            <p>
              Organization selections go to the shared care team, not a private
              practitioner inbox. Selecting two people in the same team sends
              one copy there.
            </p>
          )}
          {saved.kind === "message" ? (
            <label>
              Message to share
              <textarea
                aria-label="Care message draft"
                rows={5}
                maxLength={10000}
                placeholder="Write the question you want to share"
                disabled={busy || !writable}
                value={draft.content}
                onChange={(e) =>
                  edit({ ...latest.current, content: e.target.value })
                }
              />
            </label>
          ) : (
            <label>
              Available appointment time
              <select
                aria-label="Appointment time"
                value={slotIndex < 0 ? "" : slotIndex}
                disabled={busy || loading || !appointmentRecipient}
                onChange={(e) => {
                  const s = options?.slots[Number(e.target.value)];
                  edit({
                    ...latest.current,
                    slot:
                      e.target.value && s
                        ? {
                            startsAt: s.startsAt,
                            endsAt: s.endsAt,
                            timezone: s.timezone,
                          }
                        : null,
                  });
                }}
              >
                <option value="">Choose a time</option>
                {options?.slots.map(
                  (s, i) =>
                    s.practitionerId === draft.practitionerId && (
                      <option key={`${s.id}:${s.startsAt}`} value={i}>
                        {new Date(s.startsAt).toLocaleString(undefined, {
                          timeZone: s.timezone,
                        })}{" "}
                        –{" "}
                        {new Date(s.endsAt).toLocaleTimeString(undefined, {
                          timeZone: s.timezone,
                        })}{" "}
                        · {s.timezone}
                      </option>
                    ),
                )}
              </select>
              {appointmentRecipient &&
                !options?.slots.some(
                  (s) =>
                    s.practitionerId === appointmentRecipient.practitionerId,
                ) && (
                  <span>
                    No available times were found in the next 90 days.{" "}
                    <Link href="/appointments">Open appointments</Link>.
                  </span>
                )}
            </label>
          )}
          {options?.status === "available" && !options.recipients.length && (
            <p>
              No eligible connected recipient is available for this action.{" "}
              <Link href="/sharing">Review Sharing</Link>.
            </p>
          )}
          {options?.bounded && (
            <p>This list contains a limited set of current options.</p>
          )}
          {active && confirmation && confirmation.version === saved.version && (
            <p className="care-send-question" role="status">
              {confirmation.question} You can tap Send or reply “go ahead” in
              chat. Reply “cancel” to cancel this pending Send.
            </p>
          )}
          {!active && saved.kind === "message" && (
            <p>
              Use this card’s Send button after review; a reply to a different
              question will not send this draft.
            </p>
          )}
          {failed > 0 && (
            <p>
              {sent} saved; {failed} not saved. Successful copies will not be
              sent again.
            </p>
          )}
          <div className="qrow">
            <Btn
              sm
              type="submit"
              disabled={
                busy ||
                loading ||
                summaryState !== "ready" ||
                Boolean(draft.summary && !draft.summary.text.trim()) ||
                !hasEligible ||
                (saved.kind === "message"
                  ? !draft.content.trim()
                  : slotIndex < 0)
              }
            >
              {busy
                ? "Saving…"
                : saved.state === "sending"
                  ? "Resume unsaved copies"
                  : failed
                    ? "Retry selected unsaved copies"
                    : saved.kind === "message"
                      ? "Send message"
                      : "Request appointment"}
            </Btn>
            <Btn
              sm
              type="button"
              disabled={busy}
              onClick={() => void submit("dismiss")}
            >
              Dismiss
            </Btn>
            <Btn
              sm
              type="button"
              disabled={busy || loading}
              onClick={() => void refresh()}
            >
              {loading ? "Checking recipients…" : "Refresh options"}
            </Btn>
          </div>
          <small role="status">
            {saving
              ? "Saving private draft…"
              : JSON.stringify(draft) === JSON.stringify(saved.payload)
                ? "Private draft saved"
                : "Draft changes pending"}
          </small>
        </form>
      )}
      {!finished && error && (
        <p role="alert" className="ui-notice">
          {error} Your draft is retained here.{" "}
          <Btn
            sm
            type="button"
            disabled={busy}
            onClick={() => void flush().catch((e) => setError(errorMessage(e)))}
          >
            Retry saving draft
          </Btn>
          <Btn
            sm
            type="button"
            disabled={busy}
            onClick={() => void reloadSaved()}
          >
            Reload saved draft
          </Btn>
        </p>
      )}
    </section>
  );
}
