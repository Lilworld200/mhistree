# T04 stack and contactless authentication decision

## Implemented T06–T09 decision — 2026-10-10

The documentary Clerk candidate below is superseded for the rebuild. The owner confirmed no contactless development instance should be assumed and authorized a fresh setup. Selected adapter: Keycloak26.8 with supported username/password and optional verified email, tested against an isolated real loopback provider; PostgreSQL18.4 native local clusters prove transactions/RLS. This avoids the unrelated connected Reslz project and does not synthesize patient contacts. The extra auth service is justified by the contactless invariant, with hosting/hardening costs explicit. It is an implementation choice, not a new owner product requirement. See [auth contract](../contracts/auth.md) and [shared foundation evidence](../tasks/shared-foundations-evidence.md).

Pinned application versions are in package.json/pnpm-lock.yaml. Server-only `pg` transactions operate the private schema; hosted Supabase compatibility/configuration is not claimed from native tests. No hosted credentials, production data, old account migration or cutover was performed. Keycloak local development settings and direct-grant adapter require production security/operations review before deployment. The remaining sections retain the T04 candidate history.

2026-10-09. Status: documented candidate and feasibility plan; no provider account/configuration change or live auth spike performed. Product requirements are fixed; vendor selection is replaceable. No package upgrades during preservation/planning.

## Application/backend

Retain modular Next.js App Router/TypeScript as the target. Existing installed versions and lockfile are recorded in WORKFLOW; T06 pins verified versions in the isolated application after a clean build. Server-only domain operations, thin route adapters and minimal client projections follow the official [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication), [project structure](https://nextjs.org/docs/app/getting-started/project-structure) and [Server/Client Components guide](https://nextjs.org/docs/app/getting-started/server-and-client-components). These are current reference documents, not proof of the legacy app's security.

One Postgres/Supabase data backend with private originals, durable job/outbox records and selected embeddings is the preferred candidate. The requirement for event/state transactions must be met explicitly; chained REST calls are insufficient. Keep a reviewed transactional function/adapter, not a generic service-role CRUD API. The existing AI gateway is an adaptation candidate, with explicit provider/model configuration, versioned embeddings and truthful failure handling. Do not retain arbitrary fallback providers or parser output to make a flow appear successful.

Supabase guidance and current changelog were consulted during the audit. The installed app uses @supabase/ssr; the October 2026 @supabase/server framework-adapter deprecation notice does not itself require replacing this package. Recheck relevant changelog entries against pinned versions at T06/T08. [Supabase changelog](https://supabase.com/changelog).

## Contactless feasibility

Supabase's documented password identities use email or phone, so the current email-bound implementation cannot meet no-contact activation/login directly. Do not fabricate patient addresses or abuse anonymous users as permanent credentials. [Password authentication](https://supabase.com/docs/guides/auth/passwords).

**Candidate: Clerk username/password authentication plus supported Supabase third-party integration.** Clerk documents username as a user identifier and optional contact fields in backend user creation. Configure username/password with contacts optional; validate exact instance restrictions in T08. These documents establish a plausible supported route, not successful deployment. [User management](https://clerk.com/docs/guides/users/managing), [createUser](https://clerk.com/docs/reference/backend/user/create-user), [sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options).

Use the current Supabase third-party integration with Clerk-issued tokens; do not use the deprecated shared-JWT-secret template integration. Map string subject to internal account/person. Application DB policy still checks current consent, assignments and session retirement; token organization claims alone cannot define Mhistree clinical access. [Supabase Clerk integration](https://supabase.com/docs/guides/auth/third-party/clerk).

Invitation codes remain Mhistree's narrowly scoped identity/setup workflow. A verified one-time redemption permits only patient-chosen credential setup; it is not a broad provider login. Use supported provider create/update credential APIs inside that restricted operation, with durable reconciliation if external provider creation and local account mapping diverge. Provider APIs allow password updates/session invalidation options; live recovery must prove old sessions are denied immediately through local account/session state as well. [updateUser](https://clerk.com/docs/reference/backend/user/update-user).

Do not use a combined sign-in-or-up convenience flow without verification: Clerk's documented combined flow does not support username-only identification. Use separately supported username sign-in and restricted setup, and prove them with real sandbox operations. [Combined-flow limitation](https://clerk.com/docs/guides/development/custom-flows/authentication/sign-in-or-up).

## T08 blocking spike packet

Inputs: isolated non-production Supabase project/local DB, Clerk development instance/configuration rights, supported SDK/version documentation, no real identities. Configuration/terms requiring owner action stay explicit; do not silently buy a service. Patient contact data stays absent throughout the core test.

1. Register a person without account/email/phone; record synthetic care against stable person identity.
2. Issue private expiring invitation; patient redeems once, chooses username/opaque login and password; map provider subject to the same person. Staff API must not accept a chosen patient password.
3. Log out/in with identifier+password; test wrong password, rate limits, expiry, replay, replacement and simultaneous redemption. An unconsumed setup session cannot read care history.
4. Add optional contact separately and verify it; do not automatically mark a user-supplied contact verified because a backend create API defaults that way.
5. Identity-checked recovery changes credential and retires all old app/provider sessions. Test an old still-cryptographically-valid JWT at DB/API/storage boundaries. Provider failure yields recoverable pending state, never broad access.
6. Simulate crash after provider creation before local mapping, webhook replay/out-of-order delivery, duplicate username, and retired-account event. Retry yields one account/person, no lost care or account resurrection.
7. Exercise signed external token RLS, subject mapping, revoked consent, wrong issuer/audience and session epoch. Record configuration, exact commands, observed status, costs/limits and provider restrictions without secrets.

Pass criterion: real contactless activation, repeated login and recovery with session invalidation and preserved history. If provider configuration prevents this, stop T08 and select another supported identifier/password adapter; do not weaken the product or substitute a mock. T04 has a documentary feasible route; T08 remains not-started and blocks dependent implemented auth flows until evidence exists.
