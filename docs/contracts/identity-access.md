# Identity and access contract v1 — planned

Implementation checkpoint2026-10-10: T07–T09 now implement the foundational semantics in the private `mhistree` schema. [Feature map](../feature-map.md) and owning READMEs name actual APIs. Sessions use a provider-verified exchange followed by current opaque app-session registry checks; [auth contract](auth.md) specifies the tested Keycloak adapter. No webhooks are registered. Grants/reviewer/org producers and merge/reversal remain their later tasks. Clinical SQL policy and RLS share `mhistree.can_access`; prepared contexts never bypass rechecks. The original v1 shapes below remain the target semantic contract, not a requirement to match every property name literally.

Owner: identity/auth/access with organizations/practitioner policy projections. Producers T07–09; consumers T10,T17,T19–32. This document defines semantics, not deployed SQL. IDs below are opaque internal strings; provider subject is a separate string, never assumed UUID. Schema implementation must enforce referenced uniqueness/foreign keys and privilege separation.

## Identity and session

Person: id, permanent public locator, createdAt, provisional status, immutable originPersonId and current canonical mapping. Account: id, personId, provider+subject unique pair, status (setup/active/recovery-pending/retired), sessionEpoch, lastSuccessfulPatientLoginAt. Contact: person/account association as appropriate, kind, normalized address and independently verifiedAt; optional zero-to-many. An unactivated person has zero accounts. Alias uniquely resolves a historical locator to canonical person without granting access.

No automatic link by shared email/phone/name. Controlled lookup returns minimum matching identifiers/demographics to permitted actors, bounded/rate-limited, no record snippets. Uncertain matches produce a provisional person and review request. Original registration institution/person lineage is immutable. Support/admin/reviewer privileges do not imply clinical browsing.

Authentication adapter operations: verifySession, createPatientCredential, signIn, revokeSessions, updatePatientCredential. Password material is handled only by the supported provider flow, never logged/stored in app tables. Staff issue identity-checked invitation/recovery authority; only the patient submits their chosen password in restricted setup. No invented email/phone. See [stack](../decisions/stack.md).

Invitation/recovery: opaque random one-time secret, stored digest using established libraries, purpose, person/account, expiresAt, state, generation, issuing actor/evidence and replacement link. Redeem under a lock/conditional consume; one winner in concurrent requests. Exchange for short-lived setup-only session with no clinical read capability. Replacing invitation invalidates prior generation atomically. Rate-limit attempts; never echo secrets or enumerate identities. Provider creation failure remains recoverable with stable operation ID and no second person/account. On recovery/retirement, increment sessionEpoch and deny old sessions in local registry before relying on eventual provider revocation; failed provider calls remain pending/retryable, not falsely complete.

Each protected request checks signature/issuer/audience/expiry plus current account state and session epoch/registry. A valid old JWT is insufficient after recovery/merge. Provider webhooks must be verified, idempotent and unable to reactivate a retired account. Successful patient sign-ins update survivor evidence; staff impersonation/activity never does.

## AccessContext — server-established only

```ts
type ActingContext =
  | { kind: 'patient' }
  | { kind: 'direct'; connectionId: string }
  | { kind: 'organization'; connectionId: string; organizationId: string; assignmentId: string }
  | { kind: 'initial-care'; basisId: string; organizationId: string | null; assignmentId: string | null };
type AccessContext = {
  actorAccountId: string;
  patientPersonId: string;
  sessionId: string;
  sessionEpoch: number;
  actingContext: ActingContext;
  policyRevision: number;
};
```

initial-care is an explicit narrow registration/care basis for authorized care without a login; it is not another shared-history connection. Direct initial care requires verified practitioner/registration privilege; organization initial care requires approved org, membership/privilege and required assignment. basisId binds recorded identity/consent procedure, permitted actions/categories and origins. It never opens another provider's history. Staff may record in-person consent through its own audited operation. Do not synthesize patient self context for staff.

Client sends selection IDs only. The server resolves canonical identity and establishes this context; arbitrary supplied actor, role, epoch, revision or qualification is rejected/ignored. Re-establish/recheck current authority at each operation and protected delivery; a previously validated struct is not a perpetual grant.

Policy inputs: current account/session; person ownership; organization approval; membership/privileges; professional verification; assignment(patient, staff/team, categories, status); connection and consent; resource category, original person/org/context, lifecycle, author and permitted private team. These projections are read by access without importing producer service code. Roles are readable presets, not independent evidence of effective permission.

## Consent and provenance boundaries

Connection is one direct practitioner or one organization path. Consent versions record patient, connection, categories, exclusions, method(login/in-person), responsible actor, identity-check evidence reference, timestamp and predecessor. Grant lineage records allowed origin partitions plus policy version; future finalized records in allowed categories are included only within this recorded origin scope. Assignment narrows consent. Private notes/drafts are excluded from shared final-history consent.

Revocation/narrowing increments policy revision and writes audit/outbox atomically. New protected actions fail; pending dependent work becomes paused, already delivered copies cannot be recalled. Files use controlled delivery with current authorization; a reusable public URL is not acceptable. In-flight AI must not emit additional protected output after access loss; T32 must test stream cancellation/recheck design and its measured propagation behavior. No silent switch from revoked org to valid direct context.

Reconnection creates fresh consent. Work stores the original context/basis/version and pause reason/date. Explicit authorized review selects resume/update/cancel; audit captures old/new basis and reviewer. Independently authorized recipients continue only with their own explicit narrow request basis, not inherited broad access.

## Merge and controlled reversal

Duplicate candidates/evidence have limited visibility. Designated reviewer approves verified straightforward cases; uncertain ownership/ties/missing login evidence go to support. Survivor: sole activated identity; else oldest if neither active; else most recent successful patient login if both verified. Never use record edit time.

Lock participating identities and operation ID; recheck approval, account statuses and survivor evidence. Transaction writes canonical mapping/aliases, preserved immutable origin fields, before/after grant boundaries, mapping journal, session retirement and outbox. Retain clinical sources/versions and no wider permissions. Provider revocation is reconciled out of transaction while local retired state denies access. Repeat merge request returns prior result; conflicting concurrent merge gives VERSION_CONFLICT.

Post-merge contributions retain original actor/context plus explicit origin partition and merge operation lineage; do not infer assignment during reversal. Reversal preview accounts for later records, corrections and consent. Unassignable later work requires support review, not silent copying to both people. Apply journaled mapping transactionally; reindex views; never restore retired credentials or unused tokens automatically.

## Errors, display models and checks

Return `{ok:true,data,version?}` or `{ok:false,error:{code,retryable,requestId,fieldErrors?}}`; never include hidden patient data. Use AUTH_REQUIRED/SESSION_RETIRED, CONSENT_REQUIRED/ACCESS_REVOKED, IDENTITY_REVIEW_REQUIRED, TOKEN_EXPIRED/TOKEN_USED, VERSION_CONFLICT, RATE_LIMITED and PROVIDER_UNAVAILABLE. HTTP mapping: unauth401, forbidden403 or deliberately non-enumerating404, conflict409, invalid422, rate429, provider503. Do not reveal which protected identity exists through differing responses.

List response: `{items,nextCursor}`; cursor bound to query/filter/context and stable ordering, opaque and validated. Display models include only authorized fields and meaningful context/status; no full account/provider metadata. Export and access-history operations enforce the same policy.

Required fixtures/checks: two patients, two practitioners, two organizations; valid direct+revoked org; org admin without clinical permission; assignment narrower than consent; no-account care; stale JWT after recovery; concurrent/replayed token; merge disjoint origins; reversal with later contribution. Direct HTTP/DB/storage checks must accompany UI checks. T09 supplies service proof; T25/T35 repeat through real producer screens.
