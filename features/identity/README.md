# Identity foundation

Owns Person, Account linkage, optional contacts, permanent locator/aliases, provisional status and immutable registration origins. SQL: `supabase/migrations/*_identity_foundation.sql`. Tests: `tests/integration/identity.test.ts`, isolated real PostgreSQL with synthetic fixtures.

Server APIs: `registerPerson(pool, session, contextId, input)` and `lookupPeople(pool, session, contextId, query)`. Each establishes the actor from the current session within its own transaction; callers cannot supply an account/role. `requireStaff` is the internal policy helper for already-verified actors and current capability evidence. It locks the projection and checks organization/membership or direct registration qualification. Test-only grants are never app seed data.

Registration preserves unknown birth date, permits zero contacts/account, does not link shared names/contacts and records actor/context/original institution. Contact verification is independent and defaults absent. Lookup is audited, rate-limited and bounded to10 minimal demographic candidates; it returns no clinical data. Alias is a locator, never a credential. Never expose the private schema through PostgREST.

Consumers: T08 links login to the existing person; T20/T28 call shared registration; T29 uses lookup. Direct and organization screens now call these shared services. Alias lookup follows the canonical mapping without opening clinical history.

## T29-T31 Code Map

- assistance.ts: independent recovery designation, identity support queue/decisions, audited wrapper over auth issuance. assistance-view.tsx serves private staff setup/recovery and reviewer screens. Secret codes stay in memory, are hidden on timeout/tab hiding, and are never worklist fields.
- duplicates.ts: patient/staff flags, minimum demographic queue, reviewed survivor preview and independent evidence. chooseSurvivor uses sole active account, oldest unactivated identity or latest successful patient login. Ties, missing evidence and uncertain ownership require support.
- merge.ts: global mapping and per-person auth locks, current approval/account snapshot recheck, immutable mapping journal, losing session/token retirement, pause/outbox invalidation and replay. Clinical rows and grants never move. Original patient/context/source IDs remain the reversal partition.
- merge.ts reversal: inventory token includes later contribution versions, consent and mappings. Conflicting mapping/review or a later grant spanning both identities blocks execution. Reversal retains later rows with their recorded origin and never reactivates credentials. Auth recovery after reviewed reversal creates a new opaque provider enrollment; prior accounts remain retired.
- duplicates-view.tsx and merge-view.tsx: patient/staff flag, restricted preview/decision, explicit merge and reviewed reversal. Transports live under app/api/identity and app/api/review; pages under app/identity and app/review.

Migrations 20261012082233 and 20261012082625 retain review evidence and mapping history behind private RLS. canonical_person is a patient-read resolver, not a provider grant expansion. can_access still requires each direct/organization connection's original patient and consent origins. Patient read policies expose retained finalized history and original patient chat; ownership-based clinical writes remain attributed to their original author, never reassigned.

Tests: identity-assistance, duplicates and merge, plus existing identity/auth/access suites and scripts/verify-organization-http.mts. The real-provider post-reversal test checks new login works while the old account remains retired. Operations use features/auth/reconciliation.ts to retry provider retirement; local registry retirement is immediate even during provider outage. See phase evidence for actual results and launch limits.
