# Patient phase implementation and evidence — T10–T18

2026-10-11. Active root: C:/Users/maseglo.com/.codex/worktrees/mhistree-rebuild/mhistree, codex/rebuild. Uncommitted; no hosted Supabase mutation, production migration, push or deployment. The unrelated Reslz account is never used. No visual/browser automation was used in this phase, following the owner's instruction; visual fidelity is therefore not newly certified.

## Implemented composition

| Task | Current implementation |
| --- | --- |
| T10 | Real self-registration, restricted setup, invitation redemption, contactless password login/logout, patient layout/API protection, versioned profile and optional unverified contacts. Reuses T07/T08 identities and provider. Setup cookie resumes the setup screen after refresh. |
| T11 | Durable paginated conversations, idempotent patient messages, separate AI replies, bounded generation leases/retry/cancel, current-authority publication. |
| T12 | Durable extraction journal; validated source quotes, temporal precision, activity/symptom links, held ambiguous medication/patient material, partial preservation and replay. |
| T13 | Private originals and checksum, 10MB PDF/text validation, quarantined risky PDF features, actual PDF text extraction with page references, parsing leases/retry and controlled current-session downloads. |
| T14 | Snapshot/keyset timeline filters, attribution, unknown-date placement, source/original links and retained versions. Dedicated /records/[id] makes assessment citations work outside the first timeline page. |
| T15 | Persistent source-linked health state, separate prescription/use semantics, optimistic retained corrections, professional review requests. Existing medication timing survives form edits. |
| T16 | Bounded authorized evidence, corrections/gaps/timing, validated assessment citations and support levels, interpretation only in chat, authority/version recheck. |
| T17 | Separate direct/org consent controls, current narrowing/revocation, fresh reconnect without restart, access history, streamed private record export and review requests without deletion. |
| T18 | Shared appointment request/accept/decline/reschedule/cancel with database overlap exclusion; durable participant text messages; patient request/result projection; actual patient HTTP journey. |

## Evidence

- Original T06–T09 suite passed before patient changes. Resumed complete suite: **50/50 tests, 14 files passed** (2026-10-11). Real Keycloak 26.8 and native PostgreSQL 18.4; real configured Gemini calls for chat, extraction and assessment. Fault adapters are explicitly failure tests, not provider proof.
- Interrupted Keycloak and saved local PostgreSQL were stopped. Reopened the same services/database; no reset or replacement. Initial 8 auth failures were connection-refused; subsequent auth/account 10/10 and full 50/50 passed.
- Typecheck, lint and production build passed. Final follow-up checks are recorded in WORKFLOW.
- `pnpm exec tsx scripts/verify-patient-http.mts` is an opt-in synthetic real HTTP journey. It creates a synthetic no-contact account, uses real cookies/password provider, checks durable send replay, actual AI extraction/reply, health/timeline, correction, source detail, assessment, original upload/parse/download, care/control reads, full export stream and denied reads after logout. It prints no credentials or clinical payloads. Synthetic accounts/history are retained in the isolated local app database.
- Care tests prove concurrent slot collision denial, patient cannot accept, explicit provider acceptance/rescheduling, unauthorized thread isolation, durable message replay, revocation pause and no automatic reconnect restart. Accept/decline/cancel cannot smuggle a replacement slot.
- All migrations apply to isolated native test databases and the local synthetic app database only. Producer data in care tests is explicitly fixture-created, not proof of later practitioner/org screens.

## Remaining acceptance limits — do not hide these

2026-10-13 owner update: optional contact verification/delivery is explicitly deferred to a future resource-backed task; required inputs and execution/acceptance guide are in [resource-dependent follow-ups](resource-dependent-follow-ups.md). T19-T31 producer screens now exist and their direct/organization HTTP journeys passed; the future-producer paragraph below records the original patient-phase checkpoint, not current absence. No production/human-review gate is falsely marked passed.

- **T10/T18 full phase acceptance remains open for optional contact verification delivery.** No email/SMS delivery service is configured; contacts remain visibly unverified, cannot establish ownership or enable email login automatically. Core provider tests support a verified-email login fixture, but that does not verify the patient's delivery journey. Configure an approved delivery/provider flow, implement challenge/verification UI and exercise receipt/replay/contact-change before closing this gate. No invented contact is used for contactless login.
- T13 currently supports text PDFs and UTF-8 text, not image OCR. Unreadable/scanned originals are retained with failure status. PDF keyword quarantine is not a certified malware scanner. Production durable storage, scanning, encrypted backup/restore and job deployment require T33/T35 evidence.
- Jobs persist with bounded leases/attempts and explicit manual retry; processing is driven by the current request/UI. There is no deployed autonomous worker/dead-letter operator yet. Closing a tab can leave queued work, visible on return.
- Clinical escalation/AI wording, identity procedures and retention require named human review owners/outcomes before launch. Automated tests cannot provide those approvals.
- Practitioner/org invitation producers (T20/T27), service result producers (T23), provider availability/daily work (T25) and assisted recovery UI (T29) remain scheduled future tasks. Patient care screens label missing producers truthfully. T18 does not claim their end-to-end completion.
- Record export contains authorized contributions/versions/source text; original document files are separately downloadable. It is not a complete account portability archive. Export uses one capture cutoff and checks the live session on every page; concurrent transactions are not a database-wide snapshot.
- Preserved visual references guide existing primitives; no fresh screenshot parity/accessibility/browser certification is claimed.

## Local run and ownership

Start `pwsh -File scripts/start-auth.ps1` with Java25, then `pnpm exec tsx scripts/prepare-local.mts`, then `pnpm dev`. Local app3101, Keycloak8181. The prepare script resumes the saved isolated PostgreSQL and applies only missing migration filenames. Do not silently replace an unavailable saved cluster. Secrets/configuration stay ignored under .local and .env.local. AI settings are reused from the explicitly owner-authorized existing gateway, model gemini-3.1-flash-lite.

Server operations remain in features/auth, access, health-records, ai-chat, documents, appointments, messaging and patient/account or patient/care. Thin app/api routes validate cookie/Origin/body and never accept actor authority from the browser. New schemas build on the T09 atomic kernel. See each feature README and docs/feature-map.md.

## Owner email-provider decision — 2026-10-11

The owner selected Resend as the main email provider and Supabase Auth email delivery for authentication/email verification. This supersedes the unresolved provider choice, not the tested no-contact/password identity foundation. No Mhistree Supabase project URL/key or verified delivery configuration is available in the rebuild; the connected Reslz project remains forbidden. No email was sent and no hosted Auth settings changed.

Before wiring this into the local account flow, use the intended Mhistree project's server-only configuration and a developer-controlled test mailbox. Supabase email OTP verification issues a Supabase Auth session; it must not automatically create/merge a permanent person, authorize clinical access, or silently replace the current Mhistree account session. Define the explicit existing-account binding and provider reconciliation, verify delivery/replay/contact-change, then close T10/T18. Do not synthesize a contact to accommodate either provider. SMS verification has no selected delivery service.

Official references checked: https://supabase.com/docs/guides/auth/auth-email-passwordless (OTP/template, account creation and session behavior), https://supabase.com/docs/guides/auth/auth-smtp (custom SMTP). Changelog markdown retrieval returned an unsupported-content-type error, so no claim of a successful changelog audit. Supabase can use a configured custom SMTP transport; provider selection alone is not working delivery evidence.
