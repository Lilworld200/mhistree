# Target architecture — T04, contract version 1

This is a proposed implementation design derived from the accepted product, not an inventory of working modules. Read [feature map](feature-map.md), [identity/access](contracts/identity-access.md), [clinical records](contracts/clinical-records.md), and [stack decision](decisions/stack.md). Implementation begins only in the later authorized T06 scope. T03 verifies representative guest-page reconstruction; authenticated clinical-screen verification remains explicit future coverage. These design contracts do not certify implemented behavior.

## Ownership and routes

The new app keeps root `app/` thin. Planned groups: `app/(auth)/` for login/setup/recovery; `app/(patient)/` for chat/history/health/documents/connections/account/care; `app/(practitioner)/clinician/` for professional workspace; `app/(organization)/organizations/` for administration and assigned care; `app/(review)/review/` for explicitly privileged reviews. Preserve existing public paths where meaningful; new URL names are implementation defaults, not product promises. Group names do not enforce permissions. API/action adapters validate transport, requireActor and invoke one owning operation. No clinical logic in page files.

`features/<owner>/` owns schema, explicit server functions, UI, README and tests. Start small; split repository/policy/worker modules only when needed. `components/ui/` and `components/layout/` own presentation; `lib/{db,auth,ai,storage,jobs,time,logging}/` own infrastructure. `supabase/migrations/` in the isolated new app is the sole new migration stream, never applied blindly over old migrations. Each table/function has one domain owner and a documented caller.

Client Components hold interactions and ephemeral display state. Server Components perform suitable authorized reads; handlers/actions own mutations. Server-only modules guard secrets and imports. Do not put clinical records in shared browser storage; caches include actor, patient, explicit context, policy revision and source version. Sensitive fetches bypass shared caches. Minimal display models omit inaccessible data entirely.

## Allowed dependency direction

Infrastructure imports no feature. Identity primitives and auth consume infrastructure; access consumes trusted actor/person descriptors and read-only policy repositories. Audit writes append-only event envelopes and consumes infrastructure. Health-records consumes access and audit, with contribution sources described as typed values, not imported chat/document UI. Documents and ai-chat call the health-record kernel; clinical-care calls that same kernel. Appointments and messaging call access/audit. Patient/practitioner/organization screens compose public services.

Avoid an access↔organizations/practitioner cycle: access's policy repository reads narrowly defined current membership, assignment, organization and qualification projections directly from the DB adapter. It does not import organization or practitioner server orchestrators. Those owners control writes to their tables; changing a policy-relevant row atomically increments the affected policy revision. Projection field contracts are versioned in identity-access. Likewise, health-records never imports AI extraction; extraction passes validated contributions into it. Cross-feature UI imports only published types/components, never another owner's mutable store or repository.

## Trace A: patient chat to saved event

1. Chat route → auth.requireActor → ai-chat.sendMessage(context selection, clientSendId, text, timezone). Server establishes self context and persists a source/message plus extraction outbox entry transactionally before generation.
2. ai-chat worker obtains authorized compact context through retrieval; lib/ai adapter generates a response labeled interpretation. Response delivery rechecks current session/access. Generation failure preserves the user message and visible retry state.
3. health-records extraction operation reads immutable source version, validates temporal/source spans and excludes hypothetical/third-party/AI statements. It supplies clear contributions to acceptContribution; ambiguity creates clarification items.
4. acceptContribution reauthorizes, checks source/version/item uniqueness and expected versions, writes event, state delta, audit and downstream outbox in one DB transaction. Partial extraction consists of independently atomic accepted items plus explicit unresolved items, not half-written state.
5. Timeline/state reads return source-linked projections. Index worker consumes outbox idempotently; stale derived indexes never supersede source authority.

No health-records dependency points back to ai-chat. Raw original message and response occupy distinct source kinds. Patient UI cannot claim contributor qualification.

## Trace B: organization staff reads a record

1. Workspace route requires actor and explicit organization/patient/connection/assignment selection.
2. access.establishContext verifies account/session registry, organization approval, active membership, qualification for action, assignment, connection, categories/exclusions and origin-bound consent at current DB state.
3. health-records.listTimeline receives validated context and constrained query. Repository applies the same resource policy, pagination and provenance limits before returning display rows. Private notes/drafts are absent.
4. Preview/download separately reauthorizes at delivery. Revocation/policy changes invalidate caches and stop subsequent publication; no direct-context fallback. Organization administration is not clinical access.

No clinical engine is duplicated in organization code. T27 supplies assignments to the T09 contract; T31 preserves origin boundaries already stored by T07/T09.

## Transaction and infrastructure boundary

Use Postgres transactions for domain consistency; a sequence of independent Supabase REST writes is not a transaction. T09 chooses a reviewed, narrowly granted database function or server-side transactional adapter with equivalent DB enforcement. If using SECURITY DEFINER functions, constrain search_path, revoke broad execution, derive trusted actor from verified auth context, validate every resource and audit denials without privileged caller assertions. RLS and storage policy remain defense in depth; exposed APIs cannot bypass authority with IDs.

Do not use unrestricted service-role clients for ordinary patient requests. Worker privileges are narrow and job-bound; authority is rechecked before publishing. Database locks/version predicates serialize conflicting finalization, consent changes, token redemption, booking, and merge. External auth/storage/AI cannot be included in a DB transaction: use persisted operation state, idempotent calls and explicit compensation/reconciliation, with fail-closed account/job status.

## Reuse after domain design

Keep/adapt measured Manrope/shell/button/card/dialog styling and original logos. Adapt the AI gateway behind validated configuration; replace silent fallback, unsafe prompts/logging, and missing cancellation/error handling. Supabase client construction is reusable infrastructure only after auth/RLS/session tests. Replace old person schema, clinical write paths, QR leases, extraction persistence and merge assumptions. Old parser code may supply format-specific lessons, not fake fallback output. Exact paths/rationale: [audit](audit/current-state.md).

T04 documentary gate: both traces have explicit owners and acyclic calls; a documented contactless candidate/test plan exists. Live auth, policy, transaction and UI proofs remain later gates. No new service account, provider subscription, migration or application code is created by this decision.
