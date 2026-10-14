# Resource-Dependent Follow-Ups

2026-10-14 superseding auth scope: owner selected Supabase email/password for the MVP and deferred no-email authentication. Email signup/confirmation/resend/reset code now exists; owner explicitly takes responsibility for SMTP and callback configuration. See [manual setup](supabase-auth-setup.md). Initial verified login email is now implemented; additional contact-change verification and SMS provider delivery remain separate future work. Original deferrals below do not mean the new email-auth code is absent.

Owner decision, 2026-10-13: keep contact verification and work lacking required resources as future tasks, and document what to provide/how to execute. This is explicit authorization to defer those resource-dependent gates, not evidence they passed. Current execution stops at T31. No T32-T36 work is started by this guide.

## Optional Contact Verification - T10/T18 Deferred

Provide:
- Intended Mhistree Supabase project URL and appropriate server-side/publishable configuration through ignored local environment or a secret manager; never paste service secrets into documentation.
- Confirmed Supabase Auth email settings/templates, SMTP or approved delivery configuration, and a developer-controlled mailbox authorized to receive test messages.
- Resend configuration and verified sender/domain if it is used as SMTP or main transactional transport. The owner selected Resend for main email and Supabase Auth for authentication/email verification.
- A decision on SMS delivery before promising phone verification. No SMS provider is selected.

Execution guide:
1. Read AGENTS, WORKFLOW, patient/account README, auth and identity-access contracts, T10/T18 packets and current Supabase skill/docs. Verify the intended Mhistree project, never the unrelated Reslz project.
2. Bind verification to the already authenticated Mhistree account/person and the exact pending contact version. Supabase OTP creates its own auth session; that session must not silently replace Mhistree login, create a second permanent person or transfer account ownership.
3. Add a rate-limited challenge/send/verify transport and UI. Keep delivery and verified state distinct; a contact edit invalidates pending challenges. Preserve no-contact Keycloak login and recovery.
4. Use the approved test mailbox to prove real receipt, correct binding, replay/expiry rejection, changed-contact rejection, retry/rate limits and no history from an email match. Do not count a fixture-verified email as delivery evidence.
5. Update feature README, contract, task ledger and evidence. Close only this deferred gate; do not treat it as general launch approval.

## Deployment and Human Review Resources - Outside Current Execution

Production provider hosting/TLS/backups, durable private object storage, certified upload scanning, autonomous job operations and record/original restore rehearsal require deployment infrastructure and a safe non-production environment. Supply those endpoints/secret configuration, ownership and explicit authorization before the corresponding later task. Current local storage/Keycloak are synthetic development implementations, not certified production infrastructure.

Clinical AI/escalation, identity verification procedures, retention/removal/account closure and patient explanations require named accountable human reviewers and recorded outcomes. Supply review owners, applicable policy/jurisdiction and approved procedures. Automated test success cannot substitute for these decisions.

Original font/asset licensing and broader authenticated accessibility/browser parity remain evidence gaps from preservation. Supply licensed source assets and supported browser/device expectations when that acceptance is authorized. Do not run repeated visual tests for unchanged components merely to fill a checklist.

## Current Verified Boundary

T26-T31 organization and identity workflows have local real-database/provider/HTTP evidence, and the preserved direct/patient regression suite remains exercised. See organization-phase-evidence.md for exact command results. Hosted migration, real-patient migration and production cutover are separate authorizations. No secrets, real patient identities, private credentials or review evidence belong in this guide.
