# Clinical record, processing and care contracts v1 — planned

Implementation checkpoint2026-10-10: T09 source/event/head/state/audit/outbox transactions and controlled correction versions are implemented and tested; see [record owner](../../features/health-records/README.md). New source evidence accompanies corrections, with prior versions recoverable through contribution lineage. Record categories are validated; event time precision remains explicit. Durable extraction, timeline pagination, AI retrieval and real care producers below remain later task contracts. Private original delivery has a current-access/checksum adapter boundary; T13 owns production storage and processing.

Owner: health-records; documents/ai-chat/clinical-care are source producers. Access contract v1 is mandatory. Target implementation paths are in [feature map](../feature-map.md). No new schema/API is implemented in this planning round.

## Source, time and contribution

Sources are immutable versions of patient messages, uploaded originals/pages, or professional material. AI responses are a distinct interpretation kind and never patient evidence. Source record includes ID/version, author/account, original patient/person/context/institution, capture timestamp with seconds, timezone, checksum where applicable, raw content/location and retained supersession chain.

```ts
type EventTime =
  | { precision: 'exact'; at: string }
  | { precision: 'approximate'; from: string; to: string; originalPhrase: string }
  | { precision: 'range'; from: string; to: string }
  | { precision: 'unknown'; originalPhrase?: string };
type Contribution = {
  id: string; patientPersonId: string; originPersonId: string;
  sourceId: string; sourceVersion: number; sourceItemId: string;
  authorAccountId: string | null; authorKind: 'patient' | 'practitioner' | 'import';
  originalOrganizationId: string | null; originalContextId: string;
  kind: string; category: string; bodySite: string | null; contextLinks: string[];
  reportedAt: string; occurredAt: EventTime; sourceTimezone: string;
  sourceStatus: 'patient-reported' | 'patient-uploaded' | 'professional-finalized' | 'import-unverified';
  lifecycle: 'active' | 'resolved' | 'recurrent' | 'unknown' | 'superseded';
  supersedesId: string | null; version: number; sourceSpans: string[];
};
```

kind/category use domain-validated enums in implementation; they are not arbitrary write permission. Live accepted reports require attributable actor; null authorAccountId is limited to preserved imports/unactivated attributed sources with explicit author evidence. Model is never professional author. Exact dates use offset-aware ISO instants; sourceTimezone retains IANA zone where known, explicit unknown otherwise. Approximate bounds represent supported uncertainty, not an invented exact day. Capture time is server-recorded; preserve original source timing for import.

Relative time anchors to the source's time/zone, not worker execution time. Preserve elapsed chat gaps. Running and leg pain yield separate linked activity/symptom, no inferred causation. “Other leg” requires source context or clarification. Unknown drug produces clarification item, never guessed medication. Silence does not prove resolution/adherence; unknown current status retains last-known evidence.

## Atomic acceptance and correction

### Contextual journal reports (owner decision 2026-10-17)

New patient-message extractions store `body.reportStyle="reported-predicate"` and a concise subject-free predicate in `body.text`, e.g. `went jogging for 40 minutes and found the run stressful.` The record's patient identity is the subject; no name or arbitrary replacement token is embedded in the prose. `recordNarrative` renders patient/care-team prefixes for UI and authorized AI evidence. Legacy short labels use their attributed source spans where available; longer legacy descriptions and professional/document descriptions retain their meaning. User-entered corrections remain arbitrary attributed text, without a model-style grammatical assumption. This is an additive JSON-body field, with no table migration or historical rewrite.

Chat extraction receives only earlier same-author/person/conversation patient messages (max8) and prior reports (max12), projected within 16,000 serialized characters. Assistant output, private notes, other patients and later messages are excluded. Model references must name a supplied event and quote the current source establishing the relation. A `same-report` relation uses retained optimistic revision through the existing atomic kernel; `same-incident` creates a distinct linked fact. Known conflicting dates/body sites cannot merge. An explicit incident reference may inherit the supported prior time interval; a distinct fact never inherits an earlier activity's exact timestamp without its own evidence. Unsupported dates remain unknown/held. Topic/time proximity alone is not a match rule. Original sources remain recoverable through logical version history.

Acceptance uses a short conversation advisory-lock transaction, source/event composition and per-item savepoints; no model request holds a database transaction. A changed earlier-context fingerprint pauses an unwritten extraction for fresh-model retry, preventing concurrent duplicate acceptance. A conflict after a previously partial acceptance is held for review with successful items retained, not blindly regenerated. Leases and current patient authority are rechecked at acceptance. Model language is still fallible; held/partial status is visible rather than a claim of complete capture.

AI retrieval formats the same journal description, carries event time, current source and up to5 earlier authorized source/version references with bounded spans, and flags excerpted/truncated history. Evidence is capped at40 candidates and24,000 serialized characters; `bounded` signals omitted context. These are character budgets, not model-specific token counts. Related records remain distinct reports, not inferred causal or clinically confirmed conclusions.

acceptContribution(context,input,idempotencyKey) validates source ownership/version and current access, then locks relevant state/version. One transaction writes contribution/event, affected state projection, audit and outbox. Unique `(sourceId, sourceVersion, sourceItemId, operationKind)` prevents retries from duplicating; also bind external client operation key to actor/context/body hash, rejecting reuse with a different payload. Extraction retries must preserve stable item identity, not positional model output indexes. A new source version/corrected extraction enters explicit revision reconciliation, never silently appends duplicate clinical events.

State points to contributing event/version IDs and preserves conflicts. Patient use and prescription are separate kinds. No highest-confidence overwrite, automatic drug-regimen recommendation, guessed healing or unconditional keyword resolution. Recomputable projections do not destroy manual/source history.

correctReport requires original patient authority and expectedVersion. Minor correction creates a retained revision of the same logical entry; material correction/result correction links supersession. Patients cannot rewrite professional-finalized entries; create disagreement/review request. Repeated test has a new logical event. Transaction rollback leaves both event and state unchanged; VERSION_CONFLICT returns no overwrite and asks refetch/review.

Timeline keyset order uses explicit dated/unknown bucket, supported event sort bound, then stable ID; show precision and captured time separately. Cursor includes snapshot boundary/filter/context to avoid silent duplication/skips under inserts. Unknown events do not get fabricated occurrence dates. Source previews and historical versions require current authorization independently.

## Durable jobs, files and retrieval

Owner conversational default (2026-10-17): patient replies use an informal, attentive companion voice with moderate length and natural wellbeing follow-ups. Clear self-reports still enter the independent automatic extraction pipeline without routine logging announcements or per-report permission prompts. Conversational questions, suggestions, examples and inferred causes are not patient evidence; ordinary replies cannot claim storage success without an explicit operation result. This voice change adds no clinical write authority or extraction category and does not certify clinical escalation policy.

Job fields: id, kind, source/version, actor/context/basis, idempotency key, status queued/running/partial/succeeded/failed/paused, attempts, nextAttemptAt, leaseOwner/leaseExpiry, errors, created/updated times and completed item IDs. Claim with lock/lease; recover expired leases; bounded backoff/jitter and terminal/dead-letter state; manual retry preserves operation identity. Recheck access before source read and publication. Changed/revoked basis pauses work; source-version change invalidates stale output. Retry is not automatic authorization.

Document upload saves a private original/checksum and recoverable receipt before extraction. Validate declared and detected type/size; quarantine scan policy and exact limits are T13 decisions. Storage/DB failures have explicit pending/reconciliation states; orphan cleanup cannot discard the only original. Extracted facts retain upload status; unclear patient/units/date held for clarification. Partial accepted items survive independent item transactions; visible gaps remain. No ASCII fallback pretending binary document text. Original reads/downloads use controlled current-authority delivery.

Retrieval filters patient, explicit context, categories, origins, visibility and current versions before semantic ranking; rechecks delivery. Return evidence IDs/spans, timing, gaps, contradictions, authors and support explanation. Vector model/dimensions/version accompany derived indexes. Corrections/revocation/merge enqueue invalidation; stale indexes must be filtered against authoritative records. Empty failed retrieval is an error/limited-context state, not evidence that history is empty. Assessment persists only as labeled chat interpretation.

## Care transitions and shared surfaces

Private notes: author-only by default; patient association still needs current access. Draft: author/permitted team, never patient timeline. Finalization explicitly rechecks qualification, authority, expectedVersion and idempotency; atomic professional entry/event/state/audit. AI suggestion requires human review and attributable finalizer.

Service request transitions: requested→accepted→in-progress→performed→result-draft→finalized; cancellation allowed before finalization by an authorized actor with reason; permission loss→paused from unfinished states. Persist prior state. Reconnection allows review→resume(previous state)/update/cancel, never automatic restart. Request names patient, test/service, requester, recipient, dates/priority and narrow authorization basis. Recipient must be verified and explicitly privileged. A tentative note is not a request. Finalized corrected result preserves prior version; new repeated test remains separate. Independent recipient authority permits only its own narrow work; document basis at every transition.

Appointments have timezone-aware start/end, participants/context, request/accepted/declined/cancelled state and version. Enforce overlap through DB serialization/constraint, not client availability alone. Rescheduling changes version atomically; concurrent losers receive conflict. Messaging is separate from AI chat: authorized participants, persisted message/source/send key, delivery/failure state, paginated history and minimal notifications. Revoked dependent actions deny/pause consistently; read/unread is not care completion.

## Errors and downstream gates

Use identity-access envelope plus EXTRACTION_PARTIAL, EXTRACTION_FAILED, VALIDATION_FAILED, VERSION_CONFLICT, PROVIDER_UNAVAILABLE, RATE_LIMITED. Preserve input/originals; give safe retry without clinical payloads in logs. Internal processing error details stay in restricted operations, with request ID shown to user.

T09 proves rollback/idempotency/access; T12 natural temporal extraction; T13 original/partial retry; T14/T15 timeline and retained correction; T16 retrieval/assessment; T22/T23 finalization/results; T24 private assistance; T31 merge origins; T32 concurrency/revocation; T35 integrated real-producer scenarios. Fixtures do not satisfy absent screen/provider workflows.
