Owner voice-recording UI decision (2026-10-27): show three dots during silence, stretching into rounded bars with microphone volume during recording. Reuse shared circular icon buttons: red X at the top cancels; solid square stop icon on the right performs the existing Stop-to-transcript-review action. Keep the control small at the left of the input, replacing the microphone in its composer slot rather than a separate large panel. Preserve five-second silence stop, recording cap, explicit reviewed Send and cleanup.

Owner conversation-continuity decision (2026-10-27): keep server-now, source capture timezone/date and event precision distinct. Use private source-cited summaries of departing conversations for bounded cumulative health and relevant life-context recall, beginning with the current chat onward, without bulk historical backfill. Prepare before the first new reply while allowing typing; preserve drafts with Retry or an explicit limited-memory continuation on failure. Timeline current versions override conflicting recall; assistant advice is never patient action. Natural context-aware check-ins do not assume persistence/resolution or create notifications/clinical writes. Private memory remains owning-patient-only, with current authority/source rechecks. Conversation navigation uses an immediate opening-message preview and a short topic title after two patient messages using up to the first four messages; naming failures cannot block replies.

Owner microphone availability refinement (2026-10-26): enable microphone messages for every authenticated account without a speech feature flag, account allowlist or added per-account/project speech quota. Owner reports manually applying migration20261026212607. Keep the selected cost-efficient Gemini STT/TTS models, one request per explicit speech action, silent-input suppression, memory-only replay reuse, ordinary authentication/ownership checks and resource/recording bounds. Provider free-tier limits remain external; do not substitute artificial app restrictions for efficient model usage or require listening approval before device testing.

Owner microphone-message decision (2026-10-26): patient /chat supports tap-to-record, manual Stop or automatic stop after five seconds without speech activity (60-second recording cap), editable transcript review and explicit Send, followed by read-aloud of the saved AI reply. Typed/history messages never autoplay. Use application input-method metadata; preserve original machine transcript/provenance separately from reviewed patient text, and extract only submitted reviewed text. Raw audio is transient by default; no always-listening or autonomous handoff. Keep provider keys server-only, current authorization checks, cancellation/resource cleanup and text fallback. Use Gemini STT/TTS initially; voice naturalness/pronunciation and real-device behavior remain verification items, not account restrictions. This does not authorize real health data on an unsuitable provider agreement or human audio/video consultations.

Owner patient-companion refinement (2026-10-26): ordinary patient AI is an attentive gist partner with a gentle wellbeing thread, natural one-at-a-time follow-ups and tailored low-risk general support. Build on prior answers; avoid repetitive advice, routine AI disclaimers and unsolicited practitioner-contact offers for everyday tiredness/stress. Let useful patient-reported health details emerge voluntarily; never pressure disclosure or infer causes/diagnoses. Recommend professional assessment for concerning, persistent, worsening, unexplained or function-limiting symptoms, relevant risks or patient request; do not require failed self-care or proven danger. Apparent immediate danger needs urgent real-world help without waiting for chat/inbox. No prescribing/treatment changes or automated handoff; connection availability must not drive escalation. Current chat may help draft text for the patient to review/send, never offer an unsupported flag/send action.

Owner chat-header refinement (2026-10-26): on /chat, hide the in-chat Conversation heading, subtitle and complete header strip on mobile (980px and below), placing the existing notification bell in the mobile app top bar. Keep desktop heading/subtitle/bell placement. Remove Conversation options and its entire menu, including the assessment entry point, on all screens. Retain sidebar/mobile-drawer saved conversations and New chat, Report processing and existing chat behavior. The bell remains disabled/unavailable until separately implemented.

Owner practitioner-AI recording decision (2026-10-26): Ask Mhistree supports permission-aware conversation and reviewed capture of explicit practitioner findings. Clarify consequential missing/ambiguous details, especially medication identity, dose and frequency. Ask the practitioner to choose a patient-facing entry or author-only private note. Confirmed entries update the timeline and relevant medication use, separate prescriptions, allergies, ongoing issues/conditions or baseline through the shared atomic clinical service. Read-only or excluded-category scope grants no write/note capability; recheck current authority for each generation/publication/save. Preserve source, uncertainty, human attribution and AI provenance; AI never autonomously diagnoses, prescribes or finalizes.

Owner button-radius refinement (2026-10-26): Care notes, Health summary and Requests & results use fully rounded pill corners (999px radius) on desktop and mobile, matching the existing button family.

Owner folder-card refinement (2026-10-26): put Health summary and permission-gated Requests & results in an attached folder-style tab at the top left of the merged patient card. Keep Care notes as a glass icon-and-text button at the top right inside the card; it need not be circular. Tighten the card inner spacing. This supersedes the circular icon and separate Requests & results tile presentation; existing access and panel behavior remain unchanged.

Owner connection-reliability decision (2026-10-26): preserve an eight-connection per-process budget split into six ordinary and two session-level credential-lock connections. Release every borrowed connection unconditionally and destroy sessions with failed unlock/connection cleanup. Retry at most once for transient acquisition failure before BEGIN; never replay transaction work or retry pool saturation automatically. Reuse pools across development reloads and keep diagnostics free of clinical text, SQL and credentials. Reuse authorized server snapshots and compose focused patient workspace reads in one authorized transaction, with one non-overlapping 15-second client refresh owner. Request-local authentication memoization must never become cross-request authorization caching. Retain current access checks, revocation clearing, session-pooler compatibility and verified TLS.

Owner-approved chat recovery (2026-10-26): practitioner discovery is a separate verified-session minimum identity lookup, not an unrestricted identity-table join in clinical retrieval. Derive the patient from the current session and verify eligible recipient/context/scope. Optional discovery failure must not block ordinary chat or masquerade as no connected practitioner; propagate session/access failures and recheck known recipients before publication. No blanket grants/RLS bypass, automated contact or clinical write follows from discovery. Database permission faults must be reported safely as database errors, not AI-provider outages.

Owner practitioner-notification decision (2026-10-26): use blue notification dots for incoming unread direct-care messages on Today, My patients and Care inbox navigation, the dashboard Care inbox shortcut, affected patient cards and the patient's Health/Care inbox controls. Health replaces the former Health summary label. Recent dashboard activity shows all loaded entries in a bounded left-aligned scroll area. A private symptom discussion or AI suggestion to contact a practitioner must not itself send an alert: the patient chooses and sends a care message/reviewed handoff. One unread message drives consistent badges; explicit acknowledgement of displayed messages clears those badges without resolving a clinical issue or completing care. Preserve current recipient scope, private-AI-chat isolation and one shared non-overlapping badge refresh owner.

Owner repository cleanup decision (2026-10-26): remove the old reference-only legacy/ application. Historical code remains recoverable from Git; current source, migrations, original assets and authoritative design/playbook references remain at their active paths. Do not recreate or execute the retired application. This cleanup does not remove supported dependency paths such as pdfjs-dist/legacy or authorize database/data deletion.

# Mhistree: portable product specification and agent rules

Revision: 2026-10-14. Governing source: Mhistree_AI_Agent_Rebuild_Playbook.pdf, implementation edition 2026-10-08, 49 pages, with subsequent explicit owner decisions recorded below.
Source SHA-256: 4FB82A3DB86AEA4DC07E8D3B96C354FF847E4A34C6F0CD99C664F3FB14833C6A.

This file is Mhistree's portable project brain. It defines the product, its boundaries, the meaning of its records, and the discipline required to implement it. It must be understandable to a developer or agent without previous chat history. It describes required behavior, not proof that existing code works.

The owner's reconstruction target is approximately 80% of the intended project from this file. Treat that as a completeness objective, not a measured result or permission to omit requirements. Functional reconstruction depends on this specification; visual reconstruction also needs verified measurements and original assets. Never invent measurements to claim fidelity.

## 1. Read first, authority, and durable memory

### 1.1 Mandatory retrieval

- MUST read this file and WORKFLOW.md before every build or maintenance task, including after compaction or in a new chat. Follow the bootstrap rule in section 14 when WORKFLOW does not yet exist.
- MUST read the relevant complete task page and referenced contracts from docs/reference/Mhistree_AI_Agent_Rebuild_Playbook.full-text.md before implementation. T01-T36 are PDF pages 9-44; Txx is page xx + 8. Also consult Appendices A-D on pages 45-48.
- MUST retain the original PDF as authoritative rendering. Extraction can flatten tables or wrap identifiers; resolve ambiguity against the PDF. If it changes, refresh the extraction and SHA-256 in WORKFLOW and reconcile these rules.
- MUST keep enduring rules here, observed implementation state in WORKFLOW, and local code maps in feature READMEs. Do not rely on conversation memory alone.
- Transferred alone, this file supplies the product/reconstruction requirements. When available, full playbook task packets remain mandatory. Record missing references/assets and their verification impact; never pretend they were read or silently replace them.
- These files provide repository-local persistence, not guaranteed automatic recall in unrelated chats or repositories.

### 1.2 Authority and decision categories

Within project decisions: latest explicit developer/product-owner instruction > current AGENTS and WORKFLOW within their respective responsibilities >= playbook > legacy code and older PDFs. This order never overrides platform/system instructions. Existing code is evidence of behavior, not authority for desired behavior.

| Category | Meaning and handling |
| --- | --- |
| Confirmed product requirement | Identity, access, records, AI, scope, and task-order requirements from the playbook and later explicit owner decisions. Preserve unless the owner changes them. |
| Recommended implementation default | Next.js/TypeScript, proposed paths, feature names, schemas, error identifiers, and backend candidates. Verify feasibility; refine with recorded rationale while preserving behavior. |
| Retained engineering rule | Compatible accessibility, interaction, maintainability, and performance guidance from the old AGENTS. It cannot change clinical meaning, scope, or inspected design. |
| Unresolved review/measurement | Auth compatibility, visual tokens/assets, clinical escalation, identity procedures, retention, or other required evidence. Never label an unverified item approved. |

Record conflicts, authorized resolutions, and affected contracts/tasks. An agent assumption does not become a developer decision because it is written into a file. Ask only when consequential ambiguity lacks an authorized default; otherwise apply governing requirements and document the implementation choice. Never silently defer accepted capabilities to make completion easier.

### 1.3 Mission

Build a patient-centered advanced electronic health record (EHR) with a continuing lifetime history. Preserve the actual existing interface while rebuilding readable, modular foundations. Work as a careful product engineer/designer. Reproducible verification and review establish completion; claimed expertise does not.

Mhistree is not Reslz: do not import commerce concepts, permissions, or design decisions from it. Source rebuild, database migration, authentication migration, and production cutover are separate activities.

Owner UI decision (2026-10-16): Git snapshot `71121bd` is the design reference for /chat, /timeline, /health and related existing pages. Read historical UI/styles only and reimplement their layouts in current components; do not restore historical authentication, stores, APIs, seeded clinical claims or permission behavior. Durable visual reference: docs/design/snapshot-71121bd.md. Preserve current functional contracts.

Owner auth-header decision (2026-10-20): on patient /auth sign-in and sign-up, place the heading at top left, health-story subtitle beneath it left-aligned, and the Mhistree logo at top right. This supersedes the centered patient auth-header reference; other form behavior is unchanged. Owner refinement (2026-10-21): sign-in and signup password fields provide an accessible Show/Hide control and start concealed.

## 2. Product model and release boundary

A person can receive care indefinitely without activating a login. Information persists across time, practitioners, and organizations with explicit attribution and access boundaries. Activated patients contribute reports, upload documents, inspect history, converse with AI, and control connections. Verified practitioners and approved organizations contribute care through authorized contexts. AI organizes and interprets evidence without becoming an autonomous clinical authority.

### 2.1 Domain vocabulary

These are required meanings, not a mandated database schema.

| Concept | Meaning |
| --- | --- |
| Person | Permanent human identity underlying the lifetime record; may have no account or contacts. |
| Account | Authentication identity linked to a person; provider subject is separate from the permanent person key. |
| Contact | Optional email/phone with separate verification state; not itself ownership proof or a care-access grant. |
| Mhistree ID / alias | Person locator. Previous IDs survive reconciliation as aliases; none authenticate or authorize by themselves. |
| Professional profile | Extension of an existing account with reviewed qualifications/status; not a second patient/practitioner login. |
| Organization membership | Affiliation/privileges within one organization; separate from qualification and patient assignment. |
| Connection / consent | Independent direct-practitioner or organization path with categories, exclusions, method, and lineage. |
| Assignment | Organization permission to act for a patient/team within the consent ceiling and staff privileges. |
| Acting context | Explicit patient, direct, or organization context for an operation, established by the server. |
| Source | Original message, document, or attributed clinical material supporting a contribution. |
| Contribution / event | Attributed information with capture/event times, source, lifecycle, and version links. |
| Persistent health state | Source-linked medication use, allergies, baseline, and ongoing issues consistent with accepted events. |
| Private note / clinical draft | Author work or explicitly permitted team work, separate from finalized patient-facing care. |
| Assessment | Labeled AI interpretation in chat, not an automatically saved diagnosis or persistent condition. |
| Service request / result | Explicit narrow test/service workflow with separately authorized recipients and versioned results. |

### 2.2 Included in the first usable release

- Patient self-registration with email/password and email verification, authorized practitioner/organization registration of people without credentials, activation, login, account/contact controls, and email or reviewed assisted recovery. MVP login activation requires email; no-email authentication is deferred by the owner.
- Reviewed professional profiles; organization registration/approval; membership, privileges, assignments, and explicit contexts.
- Independent direct and organization connections; login approval or recorded in-person consent; narrowing, revocation, reconnection, and explicit review of paused work.
- Durable patient AI chat, automatic capture of clear reports, temporal interpretation, original documents, resilient extraction, source-linked timeline, persistent health details, and corrections.
- On-demand patient assessment and practitioner AI assistance with human review boundaries.
- Practitioner private notes, reminders, permitted drafts, finalized entries, medication/prescription information, and retained corrections.
- Basic appointments/availability, text messaging, narrow test requests, and finalized/corrected results.
- Duplicate review, controlled merge/reversal, patient export, and reviewed correction/removal/account-closure requests.
- Audit, operational recovery, integration verification, required launch reviews, and developer handover supporting these workflows.

### 2.3 Deferred or outside this release

Do not build guardianship/transfer to a child, personal-support connections, printable patient cards/access PINs, or external calendar export/integration. Also exclude audio/video consultations, pharmacy fulfillment, inventory, payments, broad hospital operations, full laboratory/specimen management, and mandatory full FHIR implementation.

Medication/prescription recording does not imply electronic prescribing or fulfillment. Narrow requests do not justify hospital operations. Removal/closure are review requests, not automatic destruction of shared clinical history. Document future hooks and consumers/gates without building speculative systems.

### 2.4 Non-negotiable invariants

- Identification is not authentication or authorization.
- No-contact and unactivated patients remain supported throughout care and staff registration. MVP authentication requires email/password; no-email login is a future capability, not a current release gate.
- Every protected operation checks current server-established authority in one explicit context.
- Consent ceilings and original grant/provenance boundaries cannot be widened by assignments, context switching, or merging.
- Revocation ends dependent access while preserving history; reconnection never automatically restarts paused work.
- Original sources, authors, institutions, timestamps, and correction/version lineage remain recoverable.
- Accepted events and affected persistent state change atomically and idempotently.
- Patient report, uploaded extraction, professional conclusion, and AI interpretation retain their distinct meanings.
- AI cannot independently diagnose, prescribe, change prescribed treatment, or finalize clinical care.
- Patients cannot rewrite finalized professional findings; organizations cannot hide finalized care from the patient.
- Private notes and drafts cannot leak into patient records or unrelated retrieval.
- Evidence establishes completion; missing integrations, assets, reviews, or failing gates remain explicit.

## 3. Identity, registration, activation, and recovery

Owner professional-entry decision (2026-10-21, supersedes the 2026-10-20 entry workflow): everyone signs in through the normal /auth email/password form. Do not offer separate practitioner or organization sign-in. On patient sign-up only, Other options exposes separate practitioner and organization registration links. Each link opens its selected registration route; do not show a practitioner/organization toggle or cross-registration switch on these pages. Show “Use a setup or recovery code” only on sign-in, never on sign-up. Professional routes collect registration/applications only, using the same underlying account. Preserve server-verified workspace eligibility, reviewed professional profiles, independent memberships and direct service authorization; selecting registration type grants no clinical authority. Applicants retain their own application/status screens.

Owner practitioner-navigation decision (2026-10-21): after normal sign-in, an approved practitioner lands in the professional workspace with practitioner navigation as the primary interface. Provide the switch between personal health and practitioner work on /profile, not as a navbar/sidebar/drawer button. The ordinary account/profile navigation remains available in both modes. Visiting /profile from professional work retains that navigation until the user selects a switch; personal pages retain personal navigation. Each new sign-in defaults to professional work regardless of the previously visited mode. Determine eligibility from current server-owned professional approval; this navigation choice creates no patient connections, consent, assignments or privileges. Ordinary users retain their personal default.

Owner professional-onboarding design decision (2026-10-21, supersedes the independent visual design requested on 2026-10-20): practitioner and organization registration must follow the established Mhistree design system and auth layout: centered rounded card, heading/subtitle at left and original logo at right, soft neutral surfaces, Manrope, floating-label pill fields and dark pill actions. Do not introduce a separate navy palette, marketing column or sign-in/sign-up tabs. Place registration progress outside the form card: vertically on the left on desktop, horizontally above the card on mobile, for both practitioner and organization entry. Do not repeat numbered step labels or extra stage headings/introductory explanations inside the form card; account and application fields follow the main header/logo. Keep the staged workflow: individual account, email verification, distinct professional credentials or organization/location/administrator-authority details, review/edit, explicit submission and truthful status. Preserve one account and all approval, qualification, membership and patient-access boundaries.

Owner decision (2026-10-14, supersedes the earlier documentation-only clarification): switch MVP authentication to Supabase Auth and prioritize patient signup with email/password, email verification and email password reset. Only authorized organizations/practitioners may create a patient record without email/password; that record is not an activated login. Patient activation binds verified email authentication to the existing permanent person through the authorized setup process. No-email login is explicitly deferred until a future supported service is selected. Never fabricate contacts or link ownership by email alone. Phone authentication is being considered; do not enable it without an SMS provider and verified delivery. This decision authorizes source/auth integration changes, not destructive migration of existing patient data.

### 3.1 People and controlled lookup

- Aim for one permanent person identity while allowing separate provisional identities whenever a match is uncertain. Care continues without opening the possible match's history.
- Person creation accepts basic known details without email, phone, or activated login. Preserve unknowns; never fabricate birth dates or contacts.
- Contacts are optional and separately verified. Edits cannot silently transfer ownership. Similar names, shared phones, or matching dates do not auto-link people.
- Support controlled exact-ID lookup and limited candidate search with minimum necessary demographics, rate limits, and review flags. Finding an identity grants no clinical history.
- Self-registration and authorized practitioner/organization registration reuse identity operations. Preserve creator, original context, and source ownership.
- Activation claims a hospital-created person; do not create another identity merely because the patient now wants a login.

### 3.2 Activation and MVP email login

1. Issue a private expiring single-use setup code directly, or a one-time email link when email is available.
2. Use supported cryptographic primitives and secure randomness; store credentials hashed at rest. Atomic redemption allows concurrent attempts to succeed once.
3. Redemption grants a restricted setup session. For the MVP the patient supplies their own email/password and verifies email before obtaining clinical access. Staff never choose the password or impersonate the patient.
4. Use supported Supabase email/password login and recovery. A public Mhistree ID alone never authenticates. Staff-created no-contact people may continue receiving care without activating a login.
5. Explain pending, invalid, expired, used, and replaced credentials without leaking account existence. Offer authorized replacement/recovery.
6. Enforce attempt limits, session freshness, logout, and direct protection of routes and service calls.

The original contactless-login requirement is superseded for this MVP by the 2026-10-14 owner decision. Preserve a future adapter boundary, but do not build speculative no-email login. Verify the selected Supabase integration with real provider behavior; email delivery requires configured SMTP and valid callback URLs. Never synthesize patient contacts, expose service credentials, or hand-roll cryptography. Mocks do not establish delivery or provider feasibility.

### 3.3 Replacement and recovery

| Situation | Required behavior |
| --- | --- |
| Unactivated invitation replacement | Authorized staff verify identity; replacement atomically invalidates its predecessor. |
| Activated account recovery | Specially authorized staff record identity-check evidence, issue a private one-time recovery credential, retire prior sessions and required old credentials, and audit the operation. |
| Uncertain ownership | Escalate to Mhistree support without exposing history or allowing impersonation. |

Keep identity-review evidence out of ordinary clinical views. Secret setup/recovery codes are not permanent IDs and must not enter logs or shared worklists. Expired/replayed/replaced credentials fail. Ordinary staff membership is not recovery authority. Password setup and later contact verification remain patient actions.

## 4. Access, consent, and revocation

### 4.1 Independent paths

A patient may connect to multiple direct practitioners, multiple organizations, or both. Every protected operation uses one explicit acting context. Direct and organization access for the same practitioner remain independent: never union privileges or silently switch paths to complete an operation.

Organization access requires current organization status, valid membership, appropriate qualification/privilege, assignment, active connection, and permitted categories/provenance. Administration alone does not authorize browsing all records or finalizing care. Apply qualification requirements to credential-dependent actions, not merely menus.

New care for an unactivated patient may be recorded under an explicit authorized registration/care basis. It does not unlock another provider's history. Define and audit this basis in the access contract; registration is not universal consent.

### 4.2 Consent

Owner reciprocal-connection decision (2026-10-25): patient-initiated direct requests need receiving practitioner approval; practitioner-initiated requests need patient approval. Add independent automatic incoming-approval settings under patient /profile Account and professional /clinician/profile Account & workspace settings. Both default off. Explicit patient opt-in defines pre-approved record categories; an approved practitioner knowing the exact Mhistree ID can connect within that standing scope. The ID remains a locator; authority comes from retained patient opt-in plus current eligibility/context checks. Broader requests wait for patient confirmation. Settings affect new requests, preserve existing active consent and do not activate pending requests, restore revoked connections or resume paused care. Keep organization consent independent. Identity-checked recorded in-person consent remains an explicit patient approval path for care without an activated login. Preserve approval, settings-version, scope and responsible-actor evidence.
Owner approval-control refinement (2026-10-25): both personal and professional Connection approvals use a simple explained switch that saves immediately. No separate Save or acknowledgement step. Match the existing raised component finish. Preserve previously selected patient sharing scope when toggling; the explained switch action is the explicit opt-in.

Support login approval and identity-checked recorded in-person consent. Record patient, connection/context, categories, exclusions, timestamp, responsible actor, method, and grant lineage.

Default clinical scope covers relevant finalized records, medications, allergies, ongoing issues, and results. Explain exclusions. Scope extends to future finalized records in permitted categories until narrowed/revoked. Private notes and drafts are excluded from ordinary shared-history consent.

Patients revoke an organization as a whole, not individual internal assignments. Assignments may narrow access but never exceed the consent ceiling. Keep independent connections and origins distinct.

### 4.3 Revocation and paused work

- Immediately end connection-derived access at subsequent sensitive operations, including authors accessing their own entries through that path; preserve historical storage.
- Block reopening, editing, and finalizing drafts through revoked access. Pause dependent requests and deny unauthorized result publication.
- Clear displayed sensitive state and invalidate affected caches/indexes. Recheck file delivery, background publication, and in-flight AI responses.
- Independently authorized recipients may continue only within their own explicit valid scope; no silent fallback.
- Reconnection requires fresh consent and valid assignments. Prior scope can be a starting point, not an automatic grant or restart.
- A permitted practitioner explicitly reviews old work and chooses resume, update, or cancel. Preserve dates and audit every transition.
- Explain that previously delivered/downloaded copies cannot be recalled; do not claim remote deletion.

Apply these rules to records, files, AI, messages, appointments, drafts, and results. Staff removal, organization suspension, narrowing, and merges invalidate affected effective access without revoking unrelated valid direct connections.

Owner practitioner patient UI decision (2026-10-25, refined2026-10-26): /clinician/patients uses a single column of full clickable patient cards on mobile and desktop. Active cards show initials/profile name and direct/organization context without redundant Connected/Assigned pills, scope chips or separate Open patient record buttons. Show a concise authorized overview: today's accepted chat-derived reports when available, otherwise a broader shared-record overview; permitted last-reported medication use, separate prescriptions and recent finalized results may follow. Do not expose excluded facts, raw private chats, unaccepted extraction, private notes or drafts. Keep reported/confirmed meaning, dates, medication uncertainty and overview limits explicit. Selecting a direct patient opens a detailed patient profile, not a dashboard or a long form dump, with scoped records, medications, patient-specific practitioner AI and existing care tools; include Back to My patients.

Owner patient-profile toolbar refinement (2026-10-26): combine identity (connection/name/DOB/Mhistree ID) and record overview in one card. Above it, use new glass icon-and-text Health summary, Medications & prescriptions and Care notes controls, replacing those former large section tiles. Desktop groups them next to Refresh; mobile places Back to My patients in the top-right app bar and removes Refresh. Keep permission-based visibility, accessible names/focus and existing clinical operations. This is presentation, not expanded consent or autonomous AI care.

Owner refinement (2026-10-26): Health summary is the single entry for the report overview, authorized medication use/prescriptions and category-filtered, paginated Shared history. Remove separate Medications and Shared history actions. Care notes uses a fully circular glass icon button at the top-right inside the merged patient profile card, with an accessible name. Keep permission checks and focus return.

## 5. Health information, time, and corrections

### 5.1 Two layers of one history

Persistent information includes attributed reports, observations, documents, clinical entries, medication use, allergies, baseline, and ongoing issues. Timeline and current-state views represent accepted contributions consistently. Persistence does not establish clinical confirmation.

AI assessment is interpretation in chat. It never automatically becomes a diagnosis, timeline event, or persistent condition. A practitioner can review and finalize their own attributed conclusion through clinical-care operations.

### 5.2 Natural report extraction

Owner journal decision (2026-10-17): timeline descriptions must be short, contextual journal statements, not isolated tags such as “jogging,” “ankle” or “stressed.” Keep the patient subject separate from descriptive content so patient views say “You reported that you…” and practitioner/organization views say “The patient reported that they…”. Preserve reported-versus-confirmed meaning, relevant circumstances, event time/precision and original submission time. Use bounded prior patient evidence to relate follow-ups by time AND context. Repetition/enrichment of the same fact and occurrence updates its retained logical record; a distinct new fact in that incident is linked without duplicating the earlier activity. Different occurrences remain separate even with identical words or the same date. Neither matching keywords nor proximity alone establishes sameness. Preserve originals and versions, hold consequential ambiguity/conflicts, and keep retrieval compact with source lineage. Never fill missing context with invented clinical conclusions.

- Persist patient messages with stable IDs, exact capture time, and timezone before extraction. Store AI replies separately from patient evidence.
- Automatically save clear reports with source spans and timing. Ask about consequential ambiguity naturally; do not turn chat into a questionnaire.
- Exclude general questions, hypotheticals, third-party stories, and prior AI output from patient facts.
- Running followed by leg pain creates linked activity and symptom records without asserting causation or diagnosing injury.
- Keep unidentified medication as a visible clarification item; never guess a drug or insert it into identified medication state.
- Validate model output before writing. Preserve successful items and visible partial/failed status; use source/version/item idempotency.

### 5.3 Time and state

Store exact capture timestamps to seconds with timezone context. Event time is separate: exact, approximate, interval/range, or unknown. Anchor relative phrases such as “yesterday” to source time/timezone, including midnight boundaries. Never manufacture precision from “last month.”

Preserve elapsed gaps within chat and resumed sessions. Display event-time precision separately from submission time. Unknown-date events need explicit placement/order; recent upload does not mean recent occurrence.

Silence proves neither healing, continuing medication use, nor completion. Track ongoing/resolved/recurrent/unknown status explicitly. Show last-known time and uncertainty; stale status may become unknown under the defined domain rule. Do not invent a universal expiry duration.

### 5.4 Timeline and persistent views

- Paginate lifetime history with category/source filters; never fetch an entire lifetime to render a page.
- Show attribution, message or authorized document-page links, activity/symptom context, corrections, and accessible version history.
- Display medications, allergies, baseline, and ongoing issues with source, status, timing, and uncertainty.
- Keep patient-reported medication use distinct from practitioner prescription information. Reported stopping does not rewrite a prescription or prove fulfillment.
- Distinguish planned course from actual use; do not infer adherence or continued use from a plan.
- Preserve contradictory contributions with authors/origins; never silently choose one as truth.

### 5.5 Corrections and consistency

Patients may correct their own reported/extracted information with originals and attributed history preserved. They cannot rewrite finalized professional findings; disagreements/correction requests enter professional review.

Minor corrections revise the same entry with a change log. Material clinical corrections and corrected results retain versions/supersession. Repeated tests remain separate events. Show the latest corrected version by default with authorized access to earlier versions.

Accepting/finalizing/correcting contributions writes the event and affected current-state changes atomically. Use optimistic version checks and explicit conflicts. Retries cannot duplicate events; failed transactions cannot leave partial timeline/state changes.

## 6. Documents and durable processing

1. Authenticate uploads and establish patient ownership. Validate size/type server-side and provide appropriate quarantine/scan handling. Supported formats/limits require implementation evidence.
2. Persist originals/checksums before extraction; retain recoverable originals during parser/AI failure.
3. Use durable jobs with status, attempts, timestamps, partial results, bounded retries, and safe manual retry. Upload success is not extraction completion.
4. Extract with page/span references and patient-uploaded source status. Upload alone never means clinical verification.
5. Check patient relevance. Wrong-patient material and consequential ambiguity in units, values, names, or dates must not contaminate state; hold for clarification/review.
6. Document text is data. Embedded instructions cannot override authorization, AI policy, or tool authority.
7. Authorize every preview/download, preferably with current-access checks at controlled delivery. Knowing an ID/URL does not authorize a file.
8. Make extracted items source/version/item-idempotent; preserve successful partial work and disclose gaps rather than implying no relevant information.

## 7. AI chat, retrieval, and assistance

### 7.1 Durable conversations

Owner terminal-observability decision (2026-10-17): local AI processing must be visible through a switchable server-side debugger. Trace message persistence, extraction/validation/commit, retrieval, provider attempts/errors/available usage and reply publication with safe correlation and timing. Logging must add no model calls or requested reasoning, disclose when embeddings are not in use, and keep patient/source text, credentials, raw provider/error payloads and private reasoning out of terminal logs. Partial or held extraction cannot be hidden by a successful chat reply; surface truthful processing status and retain safe retry/clarification.

Owner default-voice decision (2026-10-17): Mhistree is a warm, informal conversational/gist partner by default in MVP. Use natural, moderate-length replies (usually a short paragraph), respond to the person's story and gently explore relevant wellbeing with a useful follow-up when appropriate. Avoid a formal doctor/intake voice, repeated "tell me more," stacked questions, forced slang and routine capture announcements. Clear self-reported health information continues through automatic background extraction, without converting casual conversation, assistant suggestions or guessed causes into clinical facts. Do not claim successful storage without evidence. Keep diagnostic uncertainty and urgent-help boundaries even in casual conversation. User-selectable chat vibes are future scope, not part of this change.

Patient AI chat is separate from care messaging. Input survives generation failure. Send/reconnect/retry uses idempotency. Preserve ordering, capture time, timezone, and elapsed gaps. Cancellation, outage, rate limits, and retry have truthful visible states; never fabricate an answer to make a flow appear successful.

### 7.2 Authorized evidence

Owner recall-presentation decision (2026-10-20): ordinary chat uses retrieved history as grounded conversational recall (“I recall you mentioned…” or “You mentioned…”), not announcements such as “I see a note.” Never paste internal event/source IDs, UUID citations or record URLs into ordinary replies. Keep provenance/source lineage internally and preserve actual dates, reported meaning and uncertainty. This supersedes earlier implementation instructions to print source IDs in conversational chat; formal assessment/practitioner source presentation remains separate. Recall must be supported by supplied evidence, never invented memory.

Owner timeline-search decision (2026-10-20): ordinary patient replies must always consult the authorized timeline, across conversations, using reusable server search functions. Retrieve relevant wording/synonyms and potentially related recent activity with capture/event times, latest versions, status uncertainty and source lineage. Candidate similarity is not proof of the same occurrence, a new unrelated episode, continuing illness, recovery or causation. Acknowledge a follow-up naturally and clarify plausible connections (earlier stomach ache versus improving belly; recent jogging versus new leg pain). Respect denied connections. Clear new observations may be preserved while their relationship remains unresolved; never automatically merge, resolve or create confirmed links from search similarity. Keep context bounded and authority checked before retrieval/delivery.

Use compact authorized persistent context plus relevant timeline events, originals, and time-aware conversation. Combine exact filters with semantic retrieval only where useful. Source links, event age, uncertainty, corrections, gaps, and contradictions travel with context.

Filter before retrieval and recheck before sensitive delivery. Isolate patient, direct, organization, and private-author contexts. Summaries/embeddings/indexes are derived and rebuildable; invalidate on source or permission changes. Repeated reports, duplicate accounts, and old AI guesses are not independent evidence.

### 7.3 Interpretation boundaries

AI may organize, explain, summarize, answer record questions, and suggest possible explanations. It does not independently confirm diagnoses, prescribe, or change prescribed treatment. Label possibilities/support as insufficient, limited, moderate, or strong with explanations when appropriate; urgency is separate.

Requested assessments or responses to material new evidence stay in chat. Insufficient evidence requires an explicit limitation, not invented certainty. Do not assume old symptoms remain current or repeatedly ask irrelevant clarification. Clinical escalation language/behavior requires a named review owner and recorded review before launch.

### 7.4 Practitioner assistance

Reuse authorized retrieval for summaries, Q&A, assessments, and editable note suggestions. Author private notes may be inputs only in the authorized author's bounded workspace; never leak them to patient chat, unrelated staff, external practitioners, or shared retrieval.

Show AI origin on suggestions. Human review and deliberate professional finalization precede publishing an attributed entry. Record the human author and retained AI-assistance provenance. AI cannot finalize itself; withhold in-flight output if permission is lost.

## 8. Practitioner, organization, and care workflows

### 8.1 Verification

Extend one account with a professional profile. Support credential upload/manual review against an authoritative source, pending/approved/rejected/suspended status, and reviewer evidence. Sponsorship or job title is not qualification. Users cannot self-assign verification; pending/suspended practitioners cannot perform credential-dependent actions.

Provide restricted review tooling. Protect direct URLs and services, not only menus. Ordinary support access must not permit casual clinical-history browsing.

### 8.2 Direct care and workspace

Verified practitioners use controlled lookup and permission-filtered My patients. Initiate login approval or identity-checked in-person consent with scope/exclusions and responsible actor. Authorized practitioners register no-contact people using shared operations and required privilege.

Compose permitted allergies, medication use, ongoing issues, and baseline first, then recent history, documents, and outstanding work. Show acting context and attribution. Fetch minimal authorized projections, not hidden records filtered in the browser.

### 8.3 Private work and finalized care

| Work type | Visibility and behavior |
| --- | --- |
| Personal notes/reminders | Author-only by default; outside patient timeline and unrelated AI retrieval. Patient-associated access still requires current authority. |
| Clinical draft | Author/permitted team; not finalized care; cannot be reopened/edited/finalized through revoked access. |
| Finalized entry | Visible to patient and authorized viewers; organizations cannot hide finalized clinical care from the patient. Preserve human author, origin, times, and versions. |

Draft consultation findings, assessments, and permitted medication/prescription information. Keep suspected diagnoses labeled suspected. Recheck authority/version at finalization and atomically commit entry, event, and affected state. Preserve corrections and paused work under sections 4-5.

### 8.4 Narrow requests and results

Create explicit requests with patient, named test/service, requester, recipient, priority, dates, and authorization basis. A private/tentative note is never automatically an order.

Represent requested, accepted/in-progress, performed, result-draft, finalized, cancelled, and paused states. Specify allowed transitions, actors, and audit events; resolve exact enum encoding in the contract.

Verify recipients separately and share minimum necessary request information. Submission/finalization requires explicit privilege, not merely a connection. Departments represent assignments/permissions; every result identifies the signed-in human contributor.

Offer “New test result” separately from “Correct existing result.” Keep originals/versions; repeats stay separate. Patients see status and finalized results. Revocation pauses dependent publication; reconnection restores eligibility only, with explicit review to resume. Independently continuing work must state its valid basis.

### 8.5 Appointments, messaging, and daily work

- Shared appointment services support request, accept/decline, reschedule, cancel, timezone handling, overlap protection, and server-side concurrent slot decisions.
- Provider availability/calendar and Today show permitted appointments, unread messages, outstanding requests, new results, and personal reminders.
- Text threads require participant authorization, durability, and delivery/failure state. They are distinct from AI chat; no audio/video or external calendar integration is implied.
- Notifications derive from durable events, deduplicate on retry, and minimize sensitive content. Message read/unread state does not prove clinical task completion.
- Patient appointment/inbox/request screens precede producer screens. Label unavailable actions and fixture-backed evidence truthfully until real producers arrive.

### 8.6 Organizations

Self-registration requires manual Mhistree admin approval with submitted information/review evidence. Support pending/approved/rejected/suspended states and verify the initial administrator before management access. Pending/suspended organizations cannot perform organizational clinical actions.

Separate administration, membership, qualification, operational/clinical privileges, consent, and assignments. Role presets are readable starting points; enforce effective privileges. Admins manage only their organization and receive no automatic clinical access.

Organization patient lists/worklists extend shared services with context/assignment, not another clinical engine. Register no-contact/unactivated patients, retain individual contributor attribution, and deny other-provider history without consent. Show pauses/review queues. Removing staff ends org-derived access while independent valid direct connections survive.

### 8.7 Required screen responsibilities

Owner upcoming-schedule refinement (2026-10-25, supersedes the earlier Recent history header decision): show the nearest confirmed upcoming appointment in a desktop card beside the compact calendar. On mobile, replace Recent history with Upcoming schedule and reveal that appointment card in a popup instead of adding permanent page content. Desktop retains history/refresh controls. Upcoming selection is independent of the browsed calendar month, with pending requests remaining separate. The desktop upcoming card fills the calendar's available height even when empty; content must scroll inside a confined height rather than enlarge the card, including large-content cases such as500 schedules. Long/unbroken text wraps within the card's width. This sizing requirement does not change the nearest-only preview or authorize lifetime/unbounded fetching.

Owner calendar refinement (2026-10-25): remove the “Your calendar” eyebrow and the visible “Calendar dates use…” timezone sentence. Keep date interpretation unchanged. Make the desktop calendar more compact with tighter date spacing; preserve the mobile calendar sizing.

Owner clinician-schedule decision (2026-10-25): /clinician/schedule has two main components: a month calendar followed by pending patient appointment requests. Confirmed booked dates are black; past confirmed dates use a faded black fill; empty dates remain unfilled. Single booked dates are circular and consecutive booked dates form a continuous rounded range, wrapping at week boundaries. Requests become calendar bookings on approval. Selecting a date opens that day's details and create/manage actions: a full-height panel entering from the right on desktop and a centered popup on mobile. Support connected-patient booking, appointment time/date changes and cancellation, and date-local availability creation/editing without a separate top-level Add availability button. Replace that former desktop/mobile header action with Recent history. Approved direct clinicians may deliberately book outside their advertised availability while current consent, qualification/privilege, overlap, version and audit checks remain enforced. Confirmed direct bookings retain confirmation when their clinician changes their time; patient reschedules remain requests. Patient names remain linked identity data, not arbitrary appointment text.

Owner Today presentation decision (2026-10-23, supersedes the dashboard layout below): /clinician/dashboard uses one connected component: a recent-activity card reusing /health’s blue gradient/white radial highlight, with Schedule, Care inbox and Requests & results links in a toolbar above it, layered in front of a narrower white author-private reminder drawer. Owner wireframe refinement (2026-10-23): the blue card has fully rounded corners and sits above the drawer, which is inset on both sides and overlaps behind its lower edge. Desktop Today heading and its care-update subtitle live inside the blue card; mobile retains the shell Today title. Remove Your workspace/Recent activity display headings and the bell icon. Latest owner refinement: desktop Refresh stays beside the three navigation links above blue; mobile Refresh lives only in the existing top navbar. The blue card has a monitor-inspired grid and static decorative pulse line, a minimum height of360px even when empty, and left-aligned white activity/empty-state text directly on blue with no white inset panel. The pulse line is decorative and must not imply measured vitals or live patient monitoring. Owner glass refinement: retain a subtle glass sheen and a visible translucent white rim, directional inner highlights/lower shading and layered outer shadows for the same raised finish as the buttons; label the drawer Reminders without a lock icon, use No reminders without a lock in its empty state, and reduce the closed reminder header to48px while preserving its accessible target and full expanded layout. Today and its care-update/private-reminder subtitle remain inside blue and use white text in light mode. Preview the three newest activities; expand/collapse more activity inline. The reminder header shows its loaded count and starts closed, independently expandable by touch/click/keyboard, with due dates ascending and undated reminders last. Keep links visible, separate truthful empty states, bounded scrolling, reduced-motion support and existing current-access clearing. Remove duplicate appointment/unread/request/result summary cards and the organization card; organization care remains available through My patients. This changes presentation only, not clinical authority or dedicated daily pages.

Owner practitioner-workspace revision (2026-10-22): dashboard/profile and additional daily-work surfaces must follow the current Markdown/PDF practitioner criteria and established Mhistree design. Today summarizes authorized appointments, unread conversations, outstanding requests, finalized results, author-private reminders and activity. Provide Schedule (availability and booking actions), Care inbox and Requests & results navigation. These daily worklists use supported direct-care projections; organization care remains explicitly selected through current assignments. Notes/drafts, clinical finalization and AI assistance stay inside the authorized patient/context workspace. Professional profile shows actual submitted credentials, current review status/capabilities and application history; pending/rejected applicants use the staged application flow rather than an independent duplicate form. Approval cannot be edited by applicants, and mode switching stays on /profile. Use desktop-only content headings, mobile topbar actions, responsive soft cards/pill controls and truthful empty/limited states.

Owner practitioner-patient layout decision (2026-10-22): /clinician/patients follows the refined Sharing visual system: established neutral cards/pill controls, no redundant summary/count cards, direct and organization-assigned patient contexts kept separate, pending/ended views with no record-opening action, and clear lookup/registration panels. Keep the content title/subtitle on desktop only; mobile uses the existing My patients topbar with Add patient when permitted. Search existing authorized lists separately from controlled exact-ID identity lookup. Patient identification or registration never implies consent or record access.

These are functional surfaces to map onto the inspected UI, not invented URLs, layouts, or navigation labels.

| Area | Required surfaces |
| --- | --- |
| Patient entry/account | Signup, invitation redemption, restricted password setup, login/logout, profile/optional contact verification, recovery guidance. |
| Patient home and health | Truthful home/empty states, durable AI chat, uploads/processing status, timeline/source previews, persistent health details, corrections and assessment. |
| Patient care/control | Separate direct/org connections, scope/access history, approval/narrow/revoke, appointments, text inbox, request/result status, private export and review requests. |
| Practitioner entry/work | Profile/credential status, workspace, direct My patients, controlled lookup/registration/consent, explicit context and authorized patient record. |
| Practitioner care | Author notes/reminders, permitted drafts, clinical finalize/correct, AI assistance, requests/results, Today, availability/calendar, inbox. |
| Organization | Registration/approval status, admin/membership/privileges, assignments/consent, patient registration/search, care worklists, narrow departmental results, assisted identity flows. |
| Restricted review/support | Practitioner/org approval, identity/recovery escalation, duplicate approval/merge/reversal, correction/removal/closure queue, operational retry and audit tooling. |

## 9. Duplicate review, merge, and reversal

### 9.1 Review

Patients and ordinary authorized staff may flag duplicates. Limited demographic/identifier candidates are suggestions, not proof, and disclose no possible-match history. Maintain provisional care while review is pending.

Designated hospital reviewers verify straightforward cases with minimum necessary identity evidence, reviewer/reason, and approval/rejection. Uncertain identity or conflicting activated ownership goes to support. Printed/patient-supplied IDs or invitations help locate records but do not prove ownership. Preview survivor and permission preservation before execution.

### 9.2 Survivor rule

| Verified situation | Survivor |
| --- | --- |
| One activated login | Retain that identity/login. |
| Neither activated | Retain the oldest identity. |
| Both activated, ownership verified | Retain the most recent successful patient-login identity; staff activity/record edits do not count. |
| Tied/missing login evidence or unresolved ownership | Escalate to support; never guess. |

### 9.3 Safety and reversal

Use an atomic/concurrency-protected operation with stable operation ID and replay handling. Preserve authors, institutions, origin person/context IDs, timestamps, document origins, consent lineage, and all versions. Keep an immutable mapping journal with evidence, reviewer, reason, before/after grants, and reversal data.

Retire the losing login and invalidate sessions/unused tokens. Previous IDs remain aliases. Delete no clinical contribution or original document. Never union permissions: pre-merge grants retain scope and original provenance boundaries unless fresh consent explicitly widens them.

Update authorized views/indexes and invalidate affected caches. Controlled reversal accounts for post-merge entries, corrections, and consent. Never automatically restore old credentials/sessions. If reversible mapping cannot be demonstrated, block merge completion and keep duplicate review operational.

## 10. Patient controls and operations

Owner profile redesign decision (2026-10-25): /profile preserves the original patient blue card design, distinct from practitioner Today. Its blue card shows the person's name, Edit profile using shared button styling with a trailing edit icon, and the actual public Mhistree ID used for care-team identification (with copy support). Put name/DOB/contact editing in a right-side scrolling editor/popup, not inline on the main page. Below, show concise profile/account information such as DOB, actual email and optional contacts with verification state; keep clinical information on Health. Remove the confusing internal organization-invitation identifier and obsolete private-login guidance from the main page; staff invitation references, if needed, must be separately explained and not confused with the patient locator. Preserve server-owned profile versions, email verification/login separation, eligible workspace switching, identity/consent boundaries and existing blue surfaces. Sharing a Mhistree ID does not authenticate or grant care access.

Owner sharing refinement (2026-10-22): remove the “You’re in control,” active-connection count and pending-request count overview cards at all widths. Keep the page heading/subtitle on desktop, hide their repeated in-content header at the mobile shell breakpoint (980px), and place the mobile Access history action beside Sharing in the existing top bar. Connection/request filter tabs retain their counts.

Owner sharing-page decision (2026-10-22): /sharing is the patient's connection hub. Preserve the existing Mhistree visual system while reorganizing layout/content into direct practitioner and organization connections, pending access requests, approved-practitioner search, and structured access history opened from an action or connection card. Let patients review and explicitly confirm scope before connecting, approve or decline requests, narrow/end access, and review ended connections. Keep export/account-review controls available as secondary content. Use responsive cards and accessible panels, not raw audit identifiers/plain event dumps. Finding a practitioner creates no access; server-owned approval, consent, provenance and organization-assignment boundaries still apply.

Show direct/org connections separately with scope, exclusions, consent method, and meaningful access history. Support approval, narrowing, immediate revocation, and fresh reconnection. In-person consent recorded before activation is reviewable afterward.

Export through authenticated scoped private delivery. Correction/removal/closure requests enter visible audited review queues. Do not promise unvalidated retention periods, automatic deletion, or authority to erase shared history.

Operate bounded retries/dead-letter handling, safe manual retry, failure/latency/queue-age/authorization-denial observability, and non-production backup/restore for records plus private originals. Logs exclude secrets and unnecessary clinical payloads. Support tooling has narrow privileges.

Before launch, name owners and record outcomes for clinical AI/escalation, identity verification, data handling/retention, and patient-facing explanations. Tests and this document do not replace clinical/policy review.

## 11. Architecture, ownership, and contracts

### 11.1 Recommended structure

Design from the product, then map reusable legacy code into it. Defaults are TypeScript and modular Next.js App Router. These are target responsibilities, not claims that paths exist.

| Path | Responsibility |
| --- | --- |
| `app/` | Thin route pages/layouts, loading/error boundaries, actions/endpoint adapters. |
| `features/<feature>/` | Business UI, validation, domain rules, server operations, targeted tests, README. |
| `components/ui/`; `components/layout/` | Inspected shared primitives/shells; no patient business rules. |
| `lib/` | Database, auth, AI, private storage, jobs, logging, and time infrastructure adapters. |
| `database/` or provider migration folder | One authoritative migration stream, policies, synthetic fixtures; no competing schemas. |
| `docs/`; `tests/` | Contracts/decisions, audit/design maps, evidence, cross-feature and end-to-end checks. |

| Feature | Ownership |
| --- | --- |
| identity | People, aliases, provisional identities, duplicates, merge/reversal. |
| auth | Provider integration, sessions, login, setup, replacement/recovery. |
| access | Connections, consent/lineage, current policy, revocation. |
| health-records | Atomic event/state kernel, time/source/version semantics, timeline, corrections. |
| documents | Originals, authorized delivery, durable extraction jobs/source references. |
| ai-chat | Conversations, retrieval/assessment, reusable practitioner assistance engine. |
| patient | Patient screen composition, home/account/care surfaces. |
| practitioner | Professional profile/verification, direct workspace and screen composition. |
| clinical-care | Private notes, drafts, entries, requests/results and transitions. |
| appointments; messaging | Their shared services and patient/provider workflows. |
| organizations | Approval, membership, privileges, assignments, organization composition. |
| audit | Accountable security/consequential domain-event records. |

Keep one rule owner and avoid circular dependencies. A small feature may need only components/, schema.ts, server.ts, tests, and README. Split policy/service/repository modules when responsibilities justify it. Share real repeated responsibilities without erasing domain distinctions. Avoid generic CRUD engines, plugin engines, or dependency-injection containers for hypothetical flexibility.

### 11.2 Request path

A thin route/action validates request/session, calls the owning server operation, checks current authorization/domain rules, transacts through a repository/adapter, and returns a minimal display model. Use Server Components for suitable reads and Client Components for interaction. UI never directly mutates clinical tables.

Deny by default. Hidden buttons/redirects are not authorization. Keep privileged clients/secrets server-only; use typed environment validation and example names without credentials. Protect exposed database/storage paths too. Jobs use narrow authority and recheck before publication.

Prefer explicit functions such as finalizeClinicalEntry, revokeConnection, and correctExtractedReport over universal entity processors. Use clear types, readable functions/names, and comments for non-obvious reasons. Validate external/model output at boundaries; return explicit failures.

### 11.3 AccessContext

Every protected patient operation receives server-established applicable fields:

| Field/check | Meaning |
| --- | --- |
| `actorAccountId` | Authenticated actor; session freshness verified. |
| `patientPersonId` | Target person; resolving identity does not authorize. |
| `actingContext` | Explicit patient/direct/organization path bound to this operation. |
| `connectionId` | Required for connection-derived access; current grant/lineage checked. |
| `organizationId`; `assignmentId` | Required where applicable; current org/membership/assignment/privilege checked. |
| Effective policy | Qualification/status, categories/exclusions, provenance, resource lifecycle, and session. |

Clients can select identifiers but cannot assert trusted roles/consent. Resolve authority on the server. Audit consequential decisions without unnecessary payloads. Architecture work must define exact types/nullability/encoding, including authorized registration/care for unactivated patients.

### 11.4 Contribution

Carry sourceId, sourceVersion, patientPersonId, author identity, original organization/context, kind, body-site/context links, reportedAt, occurredAt or interval, timePrecision, sourceTimezone, sourceStatus, lifecycle status, and supersedesId where applicable. Keep raw source and immutable origins.

Define source/version/item idempotency, atomic event/state writes, correction/version conflicts, and pagination. Keep clinical lifecycle, extraction processing status, and source verification distinguishable rather than collapsing them into an ambiguous status.

### 11.5 Other contracts and future consumers

Specify consent lineage, session invalidation, merge/reversal, job retries, service transitions, errors, and minimal display models before consumers depend on them. Patient work uses organization-capable access/provenance from the start; later screens add context/assignment.

| Foundation/producer | Consumer/handoff |
| --- | --- |
| T07 identity + T08 auth | T10 setup; T20/T28 registration; T29 assisted recovery. |
| T09 access/audit/kernel | Every read/write/job/AI path; T27 assignments; T32 isolation. |
| T09 origins/consent lineage | T30/T31 duplicate review and non-expanding merge/reversal. |
| T11 sources + T12/T13 extraction | T14/T15 timeline/state; T16 grounded retrieval. |
| T17 consent controls | T20 direct and T27 organization producers. |
| T18 patient appointment/message/request surfaces | T23/T25 real provider producers; T35 full acceptance. |
| T16 retrieval + T21 private work | T24 assistance with distinct authorized inputs. |

Record hook contract/version, producer, consumer task, fields/events, files, failure semantics, fixture, and readiness gate in WORKFLOW. Fixtures prove service contracts, not finished producer workflows.

### 11.6 Stack decisions

The playbook favors one Postgres/Supabase backend, private files, selected embeddings, and reuse of a valid AI gateway as candidates to verify. Do not retain incompatible code merely to preserve a provider. Contactless auth requires a compatibility spike using current official documentation and real tests.

For actual Supabase work, read applicable guidance/current docs and verify row-level policies, server session freshness, privileged functions, and private file access. Infrastructure is replaceable; invariants remain.

Pin verified dependencies and one lockfile. Avoid duplicate app/schema systems except documented migration boundaries. Inspect package scripts before recording real install/run/test/build commands. Never invent a command or passing result.

## 12. Interface preservation and retained engineering rules

### 12.1 Visual authority and design annex

Owner direction (2026-10-10): use the established visual guide and references for routine work. Reserve browser automation and visual testing for occasional essential checks; prefer code and integration verification otherwise. Do not repeatedly recheck an unchanged layout.

MUST inspect actual components, global styles, spacing, typography, colors, motion, navigation, density, and responsive behavior before UI changes. The PDF supplies no replacement brand palette/layout. Reuse suitable styling primitives/assets after review; separate visual reuse from obsolete business behavior.

The T03 design guide and catalog preserve source-inspected tokens, guest chat/auth references and a separately rendered representative page/button reconstruction. Authenticated-screen verification remains tracked in WORKFLOW; source inspection is not rendered acceptance. Read `docs/design/UI_GUIDE.md` and `docs/design/component-catalog.md` before UI work.

Portable measured foundation (2026-10-09): Manrope, Latin, swap display, with system sans fallback; body 16px/24px and -0.01em letter spacing. Light surfaces: stage #f3f3f2, shell #ececeb, secondary shell #f1f1f0, card #f6f6f5. Text: #181818, #6e6e6e, #9a9a9a. Hero blues #69a5ff/#347bdd; green #2f8f5b, amber #c08a2d, red #cc5348. Soft white borders at .8/.55 opacity. Shadows: 0 3px 8px black .05; 0 6px 14px black .06; 0 22px 45px black .1. Dark tokens exist in source but rendered dark acceptance is not established.

Desktop shell at 1440×1000: 20px outer padding, 288px sidebar, 20px gap, remaining-width main; sidebar radius28, main radius32. Navigation rows44px, pill radius999, 13.5px weight700. At width ≤980 use one column, 12px padding/gap, hide desktop sidebar and show sticky mobile topbar; measured mobile reference390×844. Keep the flexible header/content/composer layout and wrapping empty-state actions. Regular soft/dark buttons are50px tall, pill radius999, 13.5px weight800, 8px icon gap; focus outline2px offset3. Source button shadows/gradients and exact component variants are in the guide. Preserve density while repairing mobile input14px to the required16px, focus return, reduced motion and hit areas; known defects are not design requirements.

Original brand assets are `app/assets/images/logos/mhistree_black_logo.png` and `mhistree_white_logo.png`; hashes and unresolved source/license needs are in the design guide. Manrope is loaded through next/font/google; a portable transfer must include verified font assets/license or declare that build dependency. Do not substitute the scaffold README's font description. Page motion uses opacity/translate, .26s, easing [.22,1,.36,1]; honor reduced-motion preferences when adopting it.

The following table remains the coverage checklist; uncertain properties must not be invented.

| Annex area | Evidence to capture at T03 |
| --- | --- |
| Typography | Actual font families/files, weights, sizes, line heights, fallbacks, source/license. |
| Colors/themes | Semantic tokens, surfaces/text/borders, interaction/focus states, chart palettes, actual light/dark support. |
| Layout | Shell/navigation, spacing rhythm, widths/density, breakpoints, safe areas, mobile/laptop/ultra-wide behavior. |
| Components | Paths, props, variants, states, radii, borders/shadows, icons, accessibility, examples, defects. |
| Interaction/motion | Keyboard/focus, loading/errors, transitions, reduced motion, observed timing/easing. |
| Assets | Original logo/imagery/icon/font paths, source/license, versions/checksums where useful, missing dependencies. |
| References | Sanitized captures at recorded viewports; patient/provider pages and focus/error/empty states. |

Add verified portable tokens and essential layout rules here; keep detailed source maps in the design guide/catalog. Never use real patient information in captures. If the app cannot run, record missing visual verification and preserve source assets. Document necessary accessibility repairs and compare visual intent rather than silently redesigning.

### 12.2 Keyboard, semantics, and accessibility

- MUST support full keyboard operation and appropriate WAI-ARIA patterns; prefer native button, link, label, and table semantics.
- MUST provide visible unobscured focus-visible states, correct focus trap/move/return in dialogs, and skip-to-content. Sticky elements cannot cover focus. Never remove outlines without a visible replacement.
- MUST use meaningful page titles, hierarchical headings, suitable scroll margins, accurate accessible names, and labels for icon-only actions. Hide decorative content from assistive technology.
- MUST make status understandable without color alone. Use distinguishable chart encodings and text for status/errors.
- MUST verify readable contrast and hover/active/focus identification against applicable accessibility criteria. An optional contrast metric does not replace required evaluation.
- MUST support zoom and readable responsive layouts; never disable browser zoom. Provide at least 24px pointer targets and 44px mobile targets, expanding hit areas for smaller visuals.
- MUST give drag/swipe/path gestures keyboard and simple-pointer alternatives unless essential. Use appropriate touch handling/modal overscroll containment without breaking zoom, scrolling, or focus.
- Prefer inline help and meaningful labels to tooltips. If tooltips are used, delay first hover and make related repeats responsive.

### 12.3 Forms and feedback

- MUST preserve input values/focus through hydration/re-renders. Controlled inputs need onChange unless intentionally read-only; default/uncontrolled inputs are suitable when simpler.
- MUST allow paste, password managers, and applicable authentication-code autofill. A generic UI rule mentioning 2FA does not add a new mandatory factor to product scope.
- MUST use meaningful name, autocomplete, type, and input mode. Mobile input text is at least 16px; disable inappropriate spellcheck for identifiers/codes/emails.
- MUST accept free text and show inline validation. Submission exposes incomplete-field errors and focuses the first invalid field. Do not block typing to disguise validation.
- Single-line Enter submits; multiline Enter adds a line and Ctrl/Cmd+Enter submits where supported. Preserve expected native behavior.
- Keep submission available until a request starts, then show spinner plus original label and prevent duplicates. Enforce server idempotency too.
- Normalize whitespace only where the domain contract permits. Never blindly trim/rewrite passwords, original clinical text, or source evidence.
- Warn about unsaved edits before destructive navigation, with suitable exceptions after save. Labels and checkbox/radio controls share a usable target.
- Use polite live announcements for ordinary status/validation, clear retry/recovery, and ellipsis characters for loading/follow-up actions.
- Confirm destructive actions or provide genuinely safe undo. Clinical corrections preserve history; undo must not imply erasing audit trails.
- Optimistic feedback must be reversible and truthful. Never present activation, authorization, revocation, merge, finalization, or publication as successful before authoritative confirmation.

### 12.4 Navigation, content, and privacy

- Use actual links with normal new-tab/middle-click behavior. Restore navigation/scroll state appropriately.
- Represent useful nonsensitive tabs/filters/pagination in URLs when safe. Never put clinical text, private notes, passwords, recovery credentials, or sensitive search payloads into URL state. Deep links still require authorization.
- Design truthful loading, empty, sparse, dense, error, unauthorized, revoked, pending, and retry states. Do not disguise a mock as a working integration or leave unexplained dead ends.
- Handle long content with appropriate wrapping/truncation and min-width: 0 in flex children where needed. Essential clinical meaning remains accessible when truncated.
- Handle empty strings/arrays. Skeletons mirror final layout; explicit media dimensions prevent layout shift.
- Use locale-aware dates/times/numbers, source timezone/event precision, tabular numerals for comparisons, and hydration-safe time rendering.
- Protect brand/identifiers from corrupting auto-translation. Use clear punctuation, ellipsis characters, and nonbreaking units/shortcuts where useful.

### 12.5 Layout, motion, performance, and theme

- Preserve observed grid/alignment, spacing, radii, shadows, typography, and hierarchy. Generic preferences for layered shadows or tinted borders do not authorize redesign.
- Verify mobile, laptop, ultra-wide, zoom, and safe areas. Avoid unwanted overflow; prefer CSS flex/grid to script measurements.
- Honor reduced motion. Animate purposeful opacity/transform changes, avoid layout animation and transition: all, and keep interactions interruptible. Use appropriate transform origins, including grouped SVG transforms where needed.
- Long nonessential autoplay needs pause/stop/hide controls. Provide still/reduced-motion alternatives and accessible media descriptions/controls. This does not add audio/video consultations.
- Measure relevant performance with reliable tools, representative data, and CPU/network throttling. Address unnecessary re-renders and batch layout reads/writes when profiling identifies them.
- Keep immediate mutations responsive. The earlier sub-500ms target is an engineering goal under stated conditions, not a guarantee for every AI/extraction operation. Long work needs durable processing and visible status.
- Paginate lifetime records. Virtualize long lists when measurement and accessible interaction justify it; an arbitrary item count cannot override usability.
- Deliberately load critical above-fold assets; lazy-load noncritical media. Preload/preconnect only where useful, retain font fallbacks, and use suitable font-display behavior.
- Verify supported devices/browsers, including Safari and low-power behavior where feasible; record missing coverage honestly.
- If an inspected dark theme exists, set appropriate color-scheme, native control foreground/background, and matching browser theme color. This rule does not introduce dark mode by itself.

## 13. Sequential build map and completion gates

Execute T01-T36 in order by default, within authorized scope. Finishing one scoped task does not authorize silently executing all later groups. Each task needs its preceding gate and direct contracts. Read its full playbook page before implementation; this map provides portable ownership, outputs, and acceptance meaning.

| Task / PDF page | Intended capability and minimum gate |
| --- | --- |
| T01 / 9 | Reconcile this brain first. Preserve canon/compatible rules and unresolved design measurements. Self-contained identity/access/AI/scope/build order; no app/style changes or false implementation claims. |
| T02 / 10 | Read-only repository/UI audit, then WORKFLOW, audit and feature map. Inspect changes, paths/scripts/dependencies, representative flows, schemas/auth/AI/tests, and baseline checks. Evidence-backed keep/adapt/replace/remove/defer decisions; no destructive changes. |
| T03 / 11 | Measured UI guide, component catalog, sanitized references, design annex/assets. Reproduce/compare a representative component/page on desktop/mobile including focus/error/empty states; uncertainties explicit. |
| T04 / 12 | Independent architecture and identity/access/record/auth/job/merge contracts. Trace chat-to-event and org-read ownership without cycles; feasible contactless auth and test plan. |
| T05 / 13 | Rebuild/migration/testing plan and bounded task packets. Preserve old source/data; assign owners/files/dependencies/gates, synthetic fixtures, rollback boundaries, acceptance ledger for T06-T36. |
| T06 / 14 | Clean pinned shell, inspected UI reuse, server-only environment handling, truthful incomplete states, scripts/tests. Fresh install/build and visual checks; no client secrets. |
| T07 / 15 | Person/account/contact separation, aliases, controlled lookup, registration/origins. Store no-contact/no-account people; no auto-linking or history from guessed IDs. |
| T08 / 16 | Real contactless auth, activation/replacement/recovery, sessions. No-contact activation/login; concurrency/replay/expiry/replacement safe; recovery retires old sessions; staff cannot set passwords. |
| T09 / 17 | Shared access/audit and atomic event/state kernel with organization-capable context. Tampered/cross-patient/revoked/draft/private requests denied; rollback/replay safe; independent paths isolated. |
| T10 / 18 | Patient signup, existing-person claim, setup/login/logout/contact screens. Durable sessions, direct-route denial, optional contacts, no duplicate person for invitation claim. |
| T11 / 19 | Patient home/durable AI chat. Persist before generation; reload/retry/double-send correct; cross-patient denial; no AI reply automatically becomes fact. |
| T12 / 20 | Validated extraction/temporal interpretation. Test activity/pain, hypothetical content, “other leg,” unknown medicine, timezone/midnight, approximate month, partial failure/replay without guesses or duplicates. |
| T13 / 21 | Private originals/resilient extraction jobs. Outage preserves originals; wrong patient/unclear units held; safe retry, private previews, source links. |
| T14 / 22 | Paginated source-linked timeline. Exact/approximate/unknown times distinct; correct sources/versions, stable pagination, revoked previews denied. |
| T15 / 23 | Persistent details and patient corrections. Last-known/uncertain status, use versus prescription, retained left/right correction, professional edit denial, conflict/rollback checks. |
| T16 / 24 | Authorized retrieval/assessment. Real grounding, insufficient-evidence limitations, temporal context, extraction gaps, private-note exclusion, revoked-source withholding. |
| T17 / 25 | Patient consent/account controls, access history, export/review requests. Independent revocation/narrowing; fresh consent without auto-resume; private export; missing producers identified. |
| T18 / 26 | Patient appointment/inbox/request surfaces and patient journey gate. Real persistence/AI from entry through consent; provider fixtures labeled and external blockers explicit. Required blocked integrations cannot pass the phase. |
| T19 / 27 | Professional profile/credential review and workspace access. One account; unverified/pending/suspended privilege denial; restricted review tooling. |
| T20 / 28 | Direct My patients, lookup, consent producers, no-contact registration. History only with valid scope; in-person consent before activation. |
| T21 / 29 | Practitioner permitted views, author notes/reminders, team drafts. Explicit context; private isolation, revoked-author denial, no org impersonation. |
| T22 / 30 | Clinical draft/finalize/correct and medication information. Patient-visible care, atomic writes/replay protection, revoked finalize denial, retained versions/concurrency conflicts. |
| T23 / 31 | Narrow requests, authorized recipients, versioned results. Transition/privilege checks; patient final results; repeats separate; revoked publication denied and resume reviewed. |
| T24 / 32 | Practitioner AI summaries/Q&A/editable drafts. Authorized sources, injection resistance, private isolation, no auto-finalization, revoked in-flight delivery withheld. |
| T25 / 33 | Today, availability/calendar, text inbox, reminders, notifications. Real direct journey through booking/text/entry/request/result; double booking and unauthorized/revoked work denied; notifications deduplicated. |
| T26 / 34 | Org registration/manual approval and verified initial admin. Status/service guards; no self-approval, takeover, or cross-org management. |
| T27 / 35 | Membership/privileges, org consent, assignments/context switch. Consent ceiling enforced; removal ends org access only; admin without clinical privilege cannot finalize. |
| T28 / 36 | Org no-contact registration, assigned care, narrow recipient worklists. Attributed care before activation; cross-provider history still consent-gated; human contributor on every result. |
| T29 / 37 | Assisted setup/reissue/recovery and escalation screens. Real no-contact flow, designated privilege/private delivery, replay/expiry/replacement denial, staff-unknown password, old sessions retired. |
| T30 / 38 | Duplicate flag/candidate/reviewer workflow. Minimum disclosure, provisional care, designated approval, escalation, survivor/access preview before merge. |
| T31 / 39 | Concurrency-safe merge, alias/login retirement, controlled reversal. All survivor cases, replay/rollback, original grant boundaries, revoked grants, old-session denial, post-merge reversal; no lost records. |
| T32 / 40 | Cross-consumer revocation/isolation. Live/cached/job/AI reads, writes, files, messages, appointments, drafts/results, narrowing, staff/org changes and merge/reversal tested positively/negatively. |
| T33 / 41 | Operations, retries/dead letters, backup/restore, support queues, named review owners. Synthetic record plus original restored; outages recover without loss/duplicates; missing reviews remain launch blockers. |
| T34 / 42 | Compatible-data import/cutover rehearsal. Separate actual-data inventory; quarantine ambiguity; resumable/idempotent dry run, count/link/checksum/time/access reconciliation, tested rollback. Production requires deployment authorization. |
| T35 / 43 | Full MVP acceptance using real patient/direct/org screens. Direct API misuse, concurrency/failure, visual/accessibility, service limits, reviews and recovery evidence; core mocks do not pass. |
| T36 / 44 | Developer handover/portable memory. Truthful workflow/readmes/contracts, declared assets, clean setup/seed/test/migration/rollback/deploy runbooks, traceable patient-bug exercise; no hidden blockers. |

T18 patient, T25 direct-practitioner, and T35 integrated gates are distinct. Fixtures before producer screens exist prove contracts, not finished screens. Organization-capable identity/access/audit/provenance precede patient features even though organization screens come last.

## 14. Execution memory, maintenance, and errors

### 14.1 Bootstrap and scope

Reconcile AGENTS before implementation internals. Then perform the authorized read-only repository/UI audit, keeping observations in working memory, and create WORKFLOW from those observations before supporting design/audit/implementation artifacts. Preserve existing files and developer changes.

At the initial T01 boundary, if WORKFLOW is absent, report the governing-file handoff and defer creation to T02; do not fabricate an audit or empty ledger to satisfy a generic update rule. Once WORKFLOW exists, update it at every task boundary. Explicitly requested source-reference retention is documentation, not proof that T02 or another build gate passed.

Do not reset, stash, delete, or destructively rebuild source/data to make progress. Use a planned isolated branch/worktree or application directory when implementation begins. Keep the old app recoverable. Production-affecting work requires deployment authorization; source refactoring does not authorize cutover.

### 14.2 Every-task loop

1. Read the bounded packet: governing files, full task page/appendices, owner README, relevant contracts, callers, and design guide for UI.
2. Inspect current changes and prerequisites. Rerun previous relevant smoke and direct contract tests using real available commands. Record blockers, including missing tools/credential categories without secrets.
3. Implement one coherent slice. Split oversized tasks into Txx.1, Txx.2, etc., with inputs/outputs/checks/dependencies/handoff. Do not silently expand scope.
4. Run meaningful positive/negative checks, concurrency/retry/rollback where relevant, and UI comparisons. Do not claim fixtures prove real integrations or write tests merely mirroring implementation.
5. Record files, schema/API changes, decisions, observed results/errors, downstream consumers, uncertain/blocked work, and next safe action. Update WORKFLOW, feature map, README, and affected contracts.
6. Failed gates block dependent work. Independent documentation may proceed with the dependency stated. Never complete a group with required subtasks mocked, blocked, or untested.

### 14.3 WORKFLOW and feature-map contract

WORKFLOW records current objective/revision, real repository/app roots, branch/commit when available, baseline evidence, real commands, architecture/feature index, ordered T01-T36 ledger, active task, blockers/deferred work, future hooks, evidence index, and recent handoffs. Archive long logs in indexed task records.

Each task record includes ID/title/status, goal, prerequisites, prior gate command/result, exact read-first files, intended files, schema/contracts, steps, expected outputs, positive/negative checks, errors/handling, evidence, future consumers, and next action. Use not-started, in-progress, blocked, verified, or deferred; distinguish implementation from verification and label mock-only/not-applicable substeps with reasons.

Each feature README states purpose, public APIs, policy checks, schema ownership, files/tests/callers, future hooks, and likely failure locations. The feature map points to owners. Target paths remain targets until verified.

Handoff records date/commit where available, completed behavior, exact files, commands/results, defects, untested/blocked work, schema/API/downstream effects, design comparisons, next task and minimum read packet. Never include credentials, recovery tokens, or real patient records.

### 14.4 Bounded maintenance

For a patient bug: read AGENTS/WORKFLOW; open the patient feature-map entry and owner README; reproduce; identify route/action/contract; inspect those files and direct dependencies; fix the responsible owner; add a regression check when it proves the defect; verify affected consumers; update evidence/maps.

Broaden searches only when an import, schema, failing test, or missing map points beyond the packet. Repair the map afterward. Do not reread the entire repository by default. New owner decisions go here when they change enduring rules and into WORKFLOW when they change planned work.

### 14.5 Error behavior

Identifiers are recommended API names; behavior is mandatory.

| Failure | Required response |
| --- | --- |
| AUTH_REQUIRED / SESSION_RETIRED | Deny protected action, guide to login; no patient data in error payloads. |
| CONSENT_REQUIRED / ACCESS_REVOKED | Deny/pause, preserve history; no alternative-context fallback. |
| IDENTITY_REVIEW_REQUIRED | Keep identities separate/provisional, authorized review, no possible-match history leak. |
| TOKEN_EXPIRED / TOKEN_USED | Do not redeem; authorized replacement with non-enumerating response. |
| VERSION_CONFLICT | Preserve source versions, refetch/review; never silently overwrite. |
| EXTRACTION_PARTIAL / EXTRACTION_FAILED | Keep original/successful items, show gaps and safe retry; do not imply no relevant information. |
| PROVIDER_UNAVAILABLE / RATE_LIMITED | Retain input, bounded retry/clear state; no fabricated response. |
| MIGRATION_RECONCILIATION_FAILED | Stop cutover, preserve source, report mismatch and use verified rollback. |

Missing integration credentials are a blocker, not proof of a broken design or permission to substitute mocks for requirements. Use synthetic identities/documents in tests and documentation.

## 15. Integrated acceptance and release evidence

Each scenario records environment, command/manual steps, expected/observed results, relevant files, and evidence location. By T35 use real integrated producer screens, synthetic identities/documents, and real required integrations in the test environment. Automated success does not replace clinical review or visual comparison.

| Scenario | Observable proof |
| --- | --- |
| No-contact patient | Organization registers without contacts and records care; patient later activates by one-time code, sets password, logs in through supported identifier, and sees the same history. |
| Natural capture | Running yesterday/leg pain become linked, correctly timed/attributed events without inferred injury, causation, or indefinite persistence. Hypothetical/third-party statements do not become patient facts. |
| Partial document failure | Original survives outage; readable details retain document status; unclear units wait; retry has no duplicate; preview private. |
| Correction versus repeat | Patient corrects own extraction, not professional findings; corrected result retains old version; repeat test separate. |
| Direct care | Verified practitioner connects with consent, books, texts, drafts/finalizes, requests a test and publishes result; patient sees permitted final content. |
| Organization care | Approved org assigns qualified staff within consent; admin alone cannot read/finalize; removal ends org access while valid direct access survives. |
| Revocation mid-work | Draft/result/job/AI loses authority; no unauthorized output; history preserved; fresh consent/assignment and explicit review before resume. |
| Duplicate reconciliation | Hospital identities merge under verified survivor rules with histories/aliases intact, no wider grants, reversal preserving later records. |
| Recovery/isolation | Designated staff assist no-contact recovery; old sessions fail; cross-patient IDs, private notes and unauthorized downloads denied. |
| Operational failure | Retries and backup/restore verified, event/state consistent, UI matches references; missing integrations/reviews honestly block release. |

Also exercise tampered roles, guessed IDs, expired/replayed/replaced tokens, concurrent redemption, duplicate send/finalize/merge, double booking, version conflicts, rollback, corrected-source/index invalidation, and cross-organization access via direct APIs.

Migration rehearsals compare counts, relationships, original-file checksums, aliases, timestamps, ownership, versions, and permission expectations. Quarantine ambiguous mappings; do not guess identity or broaden grants. Verify replay/rollback before authorized cutover. If no old data exists, record evidence and mark import substeps not applicable; integrated acceptance still applies.

Release readiness requires verified required scenarios and named review outcomes, with blocked/deferred/not-applicable capabilities truthful. Acceptance is separate from deployment. Record deployed version/environment only if actually deployed.

## 16. Reconstruction and handover

A new developer/agent should explain and implement identities, access paths, source/time/version semantics, AI boundaries, core screens, care workflows, errors, and task order from this file without prior conversations.

For transfer, preserve this file with the original PDF, complete text reference, truthful WORKFLOW, contracts, feature READMEs/map, design guide/catalog, sanitized references, and original licensed assets where available. Include clean install/run, synthetic seed, test, migration, rollback, and deployment instructions with environment variable names but no credentials. Declare missing fonts, imagery, integrations, and review evidence.

Validate portability by tracing a patient behavior and an organization-authorized read from UI to owner, policy, persistence, and tests. Reconstruct a representative page/component from the verified annex/assets. Repair unexplained whole-repository dependencies. Functional detail cannot replace absent visual evidence; visual similarity cannot prove access safety.

### 16.1 Reconciliation record for this revision

The 2026-10-09 owner instruction required extracting the existing AGENTS, filtering it against the current PDF, and combining compatible content into a detailed project brain. This revision uses that authorization to reconcile old generic rules; it does not introduce new product scope.

| Earlier content | Disposition/rationale |
| --- | --- |
| Product canon, independent contexts, source/time/version rules, AI boundaries, scope, modular ownership, sequential work | Retained/expanded from playbook pp. 3-44 and Appendices A-D. Legacy behavior is not presumed correct. |
| Keyboard/focus, semantics, usable forms, responsive layouts, reduced motion, truthful errors/content resilience | Retained and grouped as compatible rules supporting UI preservation. |
| Unconditional trimming of input | Limited to domain-approved normalization; passwords/original clinical evidence must not be silently rewritten. |
| Universal optimistic UI and URL state | Qualified by authoritative clinical/access decisions and sensitive-data handling. |
| Mandatory virtualization above 50 items and universal mutation latency implication | Replaced with pagination, measured rendering decisions, stated responsiveness goal, durable long-work status. Generic heuristics are not confirmed product contracts. |
| Generic shadow/color/radius preferences and APCA-over-WCAG preference | Removed as design/acceptance authorities; inspected design and required accessible contrast govern. |
| Prescriptive video-in-picture recipe, global touch/drag assumptions, blanket above-fold preloading | Removed or limited to valid, needed, accessible implementations; no media scope expansion or uninspected design assumptions. |
| Bare reference labels, copied PDF line wrapping, repeated headings | Replaced with domain sections/tables, explicit contract meanings, and source map. |
| Missing screen/workflow, error, acceptance, review and transfer detail | Added from full task pages/appendices, not claimed as implemented functionality. |

Source map: operating rules/canon pp. 1-8; tasks pp. 9-44; AGENTS contract p. 45; WORKFLOW p. 46; maintenance/errors p. 47; integrated acceptance p. 48; provenance/defaults/references p. 49.

Official implementation references named by the playbook: Next.js project structure, authentication, Server/Client Components, and Supabase password authentication. Consult current official documentation against selected versions during implementation. This refactor does not certify any installed provider behavior.

Read the relevant installed Next.js guide in `node_modules/next/dist/docs/` before changing framework boundaries. Pin behavior to the selected version; for example, Next16.3 error retry can refetch, while reset only re-renders. Keep generated framework guidance from overwriting or repeatedly appending to this product brain.

### Owner-selected email services (2026-10-11)

Use Resend as the main email provider and Supabase Auth email sending for email authentication/verification. Preserve no-contact authentication, permanent person/account separation, verified contact state and current server authorization. Provider selection is not proof of configured delivery. Any additional provider identity/session must be explicitly bound to the existing account; do not create duplicate people, merge by email or grant clinical authority from a verified email alone. Use only a confirmed Mhistree environment, never the unrelated Reslz project. Keep configuration and delivery acceptance evidence in WORKFLOW.
