Practitioner AI capture2026-10-26: current category-specific write scope is required for both conversational private notes and published entries. Proposal generation is not a grant; client-supplied run/item IDs must resolve under current same-author/patient/explicit-context access and consent revision. Read-only scope cannot save by forged request. Direct and organization paths remain independent; organization eligibility/assignment/removal are rechecked by existing RLS and no direct fallback occurs. The selected destination requires explicit human review, never automatic reconnection/resumption. See ../tasks/practitioner-ai-recording-2026-10-26.md.

Patient overview/profile projection2026-10-26: active patient previews are derived inside their explicit direct/organization/initial-care withAccess/RLS context before any excerpt or aggregate count reaches the browser. Pending/revoked paths have no clinical overview; no union or fallback to another connection. Direct patient minimum demographics require the current approved owning practitioner's active connection before identity is returned; no contact/login data is exposed. Read/write categories are server capability projections for rendering, not submitted authority. Focus/visible polling and request errors clear sensitive state; changed known connection revision closes panels, including AI text. Current service checks still enforce each read/write/publication. Layout and glass action changes grant no additional access; no schema change.

Approval interaction refinement2026-10-25: explicit patient opt-in is now the explained switch action itself, saved immediately without a separate confirmation or Save. The UI preserves any previously stored narrower categories and identifies that scope; a first opt-in submits current supported categories for finalized health records. Versioned own-session API validation and all reciprocal/standing consent boundaries below are unchanged. No hosted migration needed.

Reciprocal direct approval2026-10-25 (latest owner workflow): patient confirmation records scoped consent but stays pending until the receiving practitioner approves, unless that professional explicitly enabled incoming automatic approval. Practitioner initiation approves their own side; the patient must approve unless an existing patient opt-in covers the exact active ID request and every non-excluded requested category. The ID is a locator; authority comes from retained scoped opt-in and current eligibility/context. Organization consent, private notes and drafts are excluded. Both settings default off, are own-account versioned/audited, and apply prospectively. Patient opt-in retains responsible account, category scope and immutable settings-version reference in the consent evidence.

Direct connections store patient_approved/practitioner_approved; active requires both. Existing reviewed active grants are preserved; historical pending direct requests still await patient approval. All new producers explicitly set both flags. Owning practitioners lock/version-check their pending direct requests before approve/decline; patients cannot approve their own outbound pending request. Turning preferences off does not revoke active grants; revoke remains explicit. Changing settings never activates pending requests, restores ended connections or resumes paused work. Practitioner initiation does not reuse patient standing approval for revoked connections. Patient-initiated reconnection supplies fresh patient consent and requires current practitioner approval or standing professional opt-in. Explicit identity-checked in-person consent remains supported for unactivated/no-contact patients. Session, qualification/privilege, provenance and independent organization boundaries remain enforced. Both settings tables are RLS-enabled with no anon/authenticated/runtime access. Hosted readiness is recorded in WORKFLOW.

Profile display extension2026-10-25: authenticated accountProfile returns patientId from the signed-in person's oldest active stored patient_identifiers alias (created_at/alias order), never the internal account UUID, and loginEmail only for the actual Supabase login identifier. This is an identification/display projection, not an access grant, authentication factor, email ownership transfer or merge. Missing locator remains unavailable. Profile edit input stays strict name/DOB/version, so the displayed locator cannot be edited through it. Staff account reference remains separately labelled in advanced profile editing help for organization memberships.

# Identity and access contract v1

Implementation checkpoint 2026-10-12: T07-T31 foundational, patient, practitioner and organization producers now use the private `mhistree` schema. [Feature map](../feature-map.md) and owning READMEs name actual APIs. Sessions use a provider-verified exchange followed by current opaque app-session registry checks; [auth contract](auth.md) specifies the tested Keycloak adapter. No webhooks are registered. Clinical SQL policy and RLS share `mhistree.can_access`; prepared contexts never bypass rechecks. [Phase evidence](../tasks/organization-phase-evidence.md) distinguishes local implementation from launch acceptance. Shapes below specify semantics rather than identical implementation property names.

Owner: identity/auth/access with organizations/practitioner policy projections. Producers T07–09; consumers T10,T17,T19–32. This document defines semantics, not deployed SQL. IDs below are opaque internal strings; provider subject is a separate string, never assumed UUID. Schema implementation must enforce referenced uniqueness/foreign keys and privilege separation.

## Identity and session

Current owner decision, 2026-10-14: Supabase email/password is the MVP login provider; no-email login is explicitly deferred. Staff still register Persons without credentials. Verified Supabase subject is bound using pending self-enrollment or a one-time staff setup approval, never by email matching or editable user metadata. Provider transitions retain the permanent Person and existing account/privilege IDs under reviewed ownership. Prior contactless-login statements below describe the superseded foundation contract.

Owner clarification, 2026-10-14 (not implemented): only authorized organizations/practitioners may create a user without email and password; ordinary patient self-signup must not offer that same creation path. Creating an unactivated Person/care record is separate from issuing a login Account. The owner requested documentation only; reconcile later activation details before any service/UI change. Existing no-contact self-enrollment behavior is implementation history, not approval under this clarification.

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

Activation or retirement into a different canonical identity ends the initial-care path. A new care operation must establish a valid consent/assignment context; an old registration basis cannot bypass the activated survivor's sharing controls. Valid unactivated bases remain explicitly selectable in assigned-patient lists.

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

### Implemented Mapping Boundary

The survivor's patient-read context resolves canonical_person for retained finalized records, chat and patient care/connection controls. Direct and organization reads still require the original connection patient ID, categories and consent origins. Neither connections, assignments, source ownership nor clinical rows are reparented. The journal retains their before-state; after-state grants are identical apart from revision invalidation. New writes retain the currently selected origin, with the immutable time-stamped mapping journal supplying reconciliation lineage. A patient cannot edit another account's authored reports merely because the identities were merged.

Merge serializes mapping operations and participating auth changes, locks identities/accounts/connections, rechecks the approved snapshot and records a stable operation ID. Losing accounts, app sessions and unused setup credentials are retired atomically. Provider retirement runs afterward and has a restricted retry transport; local access stays blocked on failure. Read models query authoritative rows, not a separate merged copy or grant union.

Reversal requires a fresh inventory digest of later contributions/versions, consent and mapping state. Writes to these tables are locked during reconciliation. Later records remain with their stored origin identity. Later consent explicitly spanning both identities requires support resolution before reversal. A survivor that has itself subsequently merged must first have that newer mapping reviewed/reversed. Prior credentials never revive: after reviewed reversal, separately designated recovery staff can issue fresh provider enrollment following renewed identity evidence. Ordinary activation of a retired identity is denied.

Restricted reviewer contexts are review:professionals, review:organizations and review:identity with explicit corresponding privileges. Staff membership cannot self-grant qualification, recovery or review privileges. Operational menus are not security controls; every service rechecks its own authority.

## Errors, display models and checks

Patient sharing extension2026-10-22: /sharing searches approved active practitioners by display name/profession through authenticated POST /api/connections action search, returning at most20 minimal profiles (id/display_name/profession/jurisdiction) and hasMore. No credential documents, contacts or patient records are directory fields. Patient action connect carries practitionerId, stable requestKey, categories and exclusions; explicit reviewed confirmation creates one direct connection and immutable login consent through the shared consent transaction. Current approval/records.read eligibility, self-connection denial, canonical patient ownership and replay are checked server-side. Existing active/pending/revoked connections use the existing versioned consent controls; retries never revive revoked access. Organization assignment rules remain independent.

Connection GET returns connections and account-review requests. History moves to authenticated POST action history with optional owned connectionId and before:{at,id}; returns items,nextCursor in pages of30. at preserves database microseconds and id is a decimal bigint string. Events carry readable actor/connection names and context labels, without raw account IDs. Ordering is timestamp then ID descending. History covers recorded record/file reads and connection operations; it does not assert every record was clinically reviewed. Search is limited30/minute/session and new connection confirmation20/minute/session. Private/no-store transport and mutation-origin checks apply to all POST actions.

Return `{ok:true,data,version?}` or `{ok:false,error:{code,retryable,requestId,fieldErrors?}}`; never include hidden patient data. Use AUTH_REQUIRED/SESSION_RETIRED, CONSENT_REQUIRED/ACCESS_REVOKED, IDENTITY_REVIEW_REQUIRED, TOKEN_EXPIRED/TOKEN_USED, VERSION_CONFLICT, RATE_LIMITED and PROVIDER_UNAVAILABLE. HTTP mapping: unauth401, forbidden403 or deliberately non-enumerating404, conflict409, invalid422, rate429, provider503. Do not reveal which protected identity exists through differing responses.

List response: `{items,nextCursor}`; cursor bound to query/filter/context and stable ordering, opaque and validated. Display models include only authorized fields and meaningful context/status; no full account/provider metadata. Export and access-history operations enforce the same policy.

Required fixtures/checks: two patients, two practitioners, two organizations; valid direct+revoked org; org admin without clinical permission; assignment narrower than consent; no-account care; stale JWT after recovery; concurrent/replayed token; merge disjoint origins; reversal with later contribution. Direct HTTP/DB/storage checks must accompany UI checks. T09 supplies service proof; T25/T35 repeat through real producer screens.
