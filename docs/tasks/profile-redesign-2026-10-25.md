# Personal profile redesign — 2026-10-25

Status: implemented and locally verified. Source uncommitted in the current root checkout on codex/sharing-connections. No hosted schema/data/account/auth/provider operation or deployment.

## Read packet and design

Read current AGENTS/WORKFLOW; account/patient ownership and direct profile/service/API callers; playbook T10/T17 and retained Appendices A–D from this chat; identity-access/auth contracts; UI guide/snapshot71121bd; shared button/SidePanel; current profile/entry tests. Owner explicitly preserves the original blue patient card and asks for name, edit action and actual patient code in it, with compact read-only details below and forms in a drawer/popup.

Research uses official [NHS App profile design](https://design-system.nhsapp.service.nhs.uk/patterns/hub-page/), [patient number placement](https://www.nhs.uk/nhs-app/help/profile/view-nhs-number/) and [contact versus login details](https://www.nhs.uk/nhs-app/help/profile/contact-details/). These support a personal identifier and clear separation of contact/login settings. Adapted only existing Mhistree profile fields; no imported NHS authorization, guardian, address, notification or clinical-preference workflows.

## Files and contracts

- account/profile.tsx: original `.hero` retained, name/Edit profile with trailing icon, actual Mhistree ID/Copy ID and concise permission explanation. Main cards: DOB/sign-in email, additional contacts, eligible workspace controls and account actions. Remove inline forms, raw staff identifier/private-login text and obsolete email-verification guidance.
- Shared SidePanel hosts full-name/DOB form, current contacts/removal and additional-contact creation. Shared soft Btn styling matches Edit/Save/contact controls. Desktop drawer560px/full height; mobile inset popup scrolls internally. Primary login email cannot be removed through ordinary contacts. Advanced staff-reference help stays collapsed in the editor with clear identification distinction.
- account/server.ts: accountProfile projects oldest non-retired alias of current actor.personId (created_at,alias ordering) as patientId; loginEmail comes only from the account whose provider is Supabase. No account UUID or private login identifier is misrepresented as a patient ID. Missing values are explicit. No schema, mutation action, provider or authorization change.
- app/globals.css: profile-only grouping, wrapping, drawer and responsive rules. Original hero gradient/highlight/radii/shadow and practitioner design remain unchanged.
- Strict existing updateProfile input remains name/DOB/version. No patientId/contact ownership mutation. Contact additions are unverified; login email is not changed by optional contacts. Source/account verification remains server-owned.

## Verification and errors

UI/entry regression17/17: patient locator and main read-only layout, trailing edit icon, versioned save/authoritative refresh/close, retained drafts on conflict, primary email control, session-loss clearing, workspace eligibility/navigation. Native PostgreSQL3/3: active own alias not retired/other person's ID, strict locator-write rejection/optimistic conflict/other-person preservation, actual loginEmail projection and verified-primary-contact removal denial. Uses synthetic local trusted fixtures, not historical Keycloak or real Supabase delivery. Tests: profile-ui, professional-entry-ui, integration/profile-projection.

Production build/TypeScript, targeted ESLint and client bundle scan passed. Final minor contact-permission error handling was rechecked with focused UI/native/lint/type checks. Native database clusters cleaned up by helpers. Only source query/display projection changes; no migration or hosted access required.

Isolated production preview using fresh local PostgreSQL/synthetic current session and blocked provider-auth/AI endpoints:990×900 and390×844, document width equals viewport. Original hero appearance inspected. Desktop editor560×900px at right; mobile popup fields/contacts scroll. Actual local HTTP name update changed hero and closed editor with focus returning to Edit profile; Mhistree ID unchanged. Additional synthetic email saved unverified, distinct from unchanged sign-in email. No real patient/contact data or email/SMS delivery. Preview/browser/native DB stopped at task end.

Evidence: [desktop](evidence/profile-2026-10-25/desktop.png), [mobile](evidence/profile-2026-10-25/mobile.png), [mobile editor](evidence/profile-2026-10-25/mobile-editor.png). Desktop990px capture intentionally fits browser adapter capture surface. Current browser synthetic account has workspace eligibility to exercise that retained card; ordinary profiles omit it. Clipboard writing was not browser-exercised; selectable-ID fallback remains if browser clipboard fails. OS reduced-motion/Safari/zoom/full assistive-tech and launch reviews remain outside this task.

## Handoff

Future profile refinements start with account README/profile/server and this record. Clinical data remains on Health; no unsupported login-email change or self-verification was added. Original blue patient card and approved-practitioner personal/workspace switch remain distinct responsibilities. Existing full product release gates are unchanged.
