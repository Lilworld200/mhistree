# Atomic record kernel

`recordSource` accepts attributed original evidence through current access. Server derives actor/context/institution/source status; request fields cannot assert them. Patient reports/uploads differ from professional finalized material and private/draft work. Sources are immutable. Client source keys serialize duplicate submissions; differing payload reuse conflicts.

`acceptContribution` validates exact/range/approximate/unknown event time, source/version/item, body/site/links, source spans and explicit status. It establishes access, checks source ownership, serializes operation/source-item keys, then writes contribution, current head, affected persistent state, audit and outbox in one transaction. Contradictory logical records remain separate; no automatic diagnosis, medication identification or healing inference occurs. Patient medication use is a separate category from prescription.

Corrections supply logicalId and expectedVersion plus new source evidence. They append a retained version/supersedes link and move the head/state together; concurrent stale versions conflict. Patient edits cannot rewrite professional findings. DB triggers prevent source/event rewriting, mismatched source origins and mismatched state projections. Private/draft entries never enter persistent health state or patient-facing reads.

`readContribution` uses RLS and records minimal audit attribution. It returns one authorized contribution; timeline pagination/projections are T14/T15, not a lifetime-wide fetch here. SQL lives in `supabase/migrations/*_access_record_kernel.sql`. Public types/validators: `schema.ts`. Tests: `tests/integration/access-records.test.ts` including injected SQL failure, replay, corrections and permission denial.

Consumers T11–T16, T21–T24 and T28 must call these owning operations. Extraction/model validation is T12; clinical finalize UX/qualification review producers are T19/T22. No HTTP mutation endpoint, AI extractor, diagnosis engine or UI finalization is implied by synthetic core tests. Typical failures: session retirement, invalid context/source authority, version conflict, transaction constraint or storage/provider unavailability.

## Patient consumers implemented in T12–T16

extraction lives in features/ai-chat/extraction. timeline.ts provides snapshot/keyset filtering and authorized source/version reads; current-state.ts supplies bounded persistent state and separate prescription projection. corrections.ts composes the kernel for optimistic retained patient changes and professional review requests. timeline-view, health-view and correction-form are patient UI consumers through /api/records and /api/health. Dedicated /records/[id] provides authenticated citation detail. Earlier references above to future T14/T15 or no HTTP endpoint describe the kernel-only checkpoint and are superseded by this section.
