# Preservation, rebuild and migration plan — T05

Planning date 2026-10-09. Implementation scope stops before T06. No data import, auth change, schema mutation or deployment has occurred.

## Source isolation

Preserved old application: repository root `C:/Users/maseglo.com/Documents/FS-projects/Mhistree/mhistree`, baseline commit `2c8c46c43e7c74ff71588f6d8fd6b3a0cf9bd64b` on master. Planning work is isolated on `codex/preservation-planning`; documentation is uncommitted until intentionally reviewed/saved. Do not mistake an uncommitted working tree for a portable Git snapshot.

Chosen T06 implementation location: a separate managed Git worktree on `codex/rebuild`, rooted independently with its own app/features/package/lockfile, created from a reviewed saved planning revision. Exact managed path will be returned by the worktree tool and recorded in WORKFLOW before coding. This is a selected isolation strategy, **not an already created checkout**. Do not copy uncommitted documentation by assumption: first preserve the approved planning changes in a commit or explicitly copy/verify the bounded docs. Never reset/stash/delete developer changes. Keep original master/checkout/source/assets recoverable.

The new worktree runs independently with its own dependencies and explicit non-production environment, on port3101 when needed; old local preview uses3100. Do not share .next, node_modules, secrets or DB migration state between checkouts. T06 establishes actual scripts before claiming run instructions. Adapt only reviewed visual/infrastructure files listed in the audit; do not blindly import prototype routes, mock stores, unsafe admin APIs or legacy migrations. Root-level source layout remains portable inside either checkout.

## Four separate workstreams

| Stream | Plan and gate |
| --- | --- |
| Source rebuild | T06–33 in isolated worktree; old source retained. Pin tested dependencies, one lockfile, real service boundaries and explicit unavailable states. |
| Database/files | New authoritative migration stream in new environment; no old destructive trigger execution. T34 inventory/mapping/dry run and full reconciliation before any cutover. |
| Authentication | T08 real supported contactless spike; T34 map verified subjects/accounts without inventing contact/ownership. Provider migration and session retirement have separate recovery plan. Never copy active sessions blindly. |
| Production cutover | T35 readiness plus explicit deployment authorization; documented version/environment/write-consistency plan and rehearsed rollback. None authorized or attempted here. |

## Rehearsal and rollback contract

1. T33 establishes backup/restore ownership and tested recovery for database, private originals, schema, provider mapping/configuration and encryption dependencies. Do not place credentials or backups with patient data in this repository.
2. T34 inventories actual source data under explicit environment authorization: counts, IDs/accounts, optional contacts and verification, origin/source/version relationships, documents/checksums, grants/assignments, successful patient-login evidence. Current local migrations are not proof of deployed schema. Whether any production data exists is unknown.
3. Create mapping manifest with source→target keys, provenance and transformation version. Quarantine ambiguous identity, clinical verification, dates and grants; preserve raw originals and report missing metadata. Unknown remains unknown; no automatic merge or wider consent to make imports pass.
4. Run on approved non-production data/synthetic fixtures. Check counts by kind/person/version, foreign keys, original checksums, timestamps/precision, alias uniqueness, surviving account ownership and positive/negative permission expectations. Replay and crash/resume must not duplicate events or invitations.
5. Rehearse auth failure compensation, revoked old sessions, merge origins and rollback. A rollback returns usable service and accounts without resurrecting retired credentials or losing accepted post-cutover writes. Choose a verified maintenance/read-only window or tested forward-write reconciliation; never promise switching code alone rolls back external/data effects.
6. Cutover runbook names operator, backup IDs/location, source/target versions, freeze or synchronization point, reconciliation thresholds (zero unexplained loss/duplicates/access expansion), go/no-go owner, abort conditions and recovery steps. Failed reconciliation stops cutover with MIGRATION_RECONCILIATION_FAILED.
7. Retain old recovery path according to reviewed data policy; no arbitrary deletion date. If inventory proves no old data, record evidence and mark only import subtasks not applicable. New integrated acceptance remains mandatory.

## Dependency plan and future hooks

Every capability has an owner, paths, inputs, steps, errors and gate in [T06–T36 packets](tasks/rebuild-packets.md). [Testing](testing.md) supplies fixtures and measurable gates. The sequential task ledger stays in WORKFLOW.

| Contract v1 / producer | Later consumer | Fields/event and failure semantics | Fixture/readiness |
| --- | --- | --- | --- |
| identity-access / T07,T08 | T10,T20,T28,T29 | person/account separation, subject, optional contacts, setup/recovery generation and sessionEpoch; deny replay/retired | P-A no-contact; real T08 spike, then T29 staff UI |
| AccessContext / T09 | T17,T20,T27,T32 | explicit path, current grant/assignment/policyRevision; no fallback | PR-A direct + ORG-A revoked; T09 negative DB/API tests, T27 real assignment producer |
| contribution/origins / T09 | T12–16,T22,T31 | source/version/item, originPerson/context, transaction/outbox; rollback/conflict | P-A/P-A2 disjoint grants; T09 replay/rollback, T31 reversal |
| source/job / T11–13 | T14–16,T23 | immutable originals, spans/timezone, processing status; partial retention and retry | DOC-PARTIAL; original checksum + replay evidence |
| consent / T17 | T20,T27 | direct/org categories/exclusions, lineage, method; narrowing/revoke current | ORG-A restricted, PR-B independent; real producers replace setup fixtures |
| appointments/messaging / T18 | T25,T35 | actor/context, version/sendId/slot times, durable events; conflict/deny | concurrent slot and unauthorized thread; T25 real direct UI, T35 org UI |
| private input/retrieval / T16,T21 | T24,T32 | author-only source set, current delivery; no publication after revoke | PRIVATE-A sentinel; T24 real AI and T32 in-flight revocation |

Future verification gaps: authenticated reference coverage; isolated real auth/storage/AI integration configuration; no current application tests; named clinical/identity/data/explanation review owners not assigned. These are concrete implementation/release gates, not hidden stubs. T03's representative reconstruction is verified; T04/T05 planning is reviewable and complete within documentary scope. No later implementation is marked complete.
