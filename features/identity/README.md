# Identity foundation

Owns Person, Account linkage, optional contacts, permanent locator/aliases, provisional status and immutable registration origins. SQL: `supabase/migrations/*_identity_foundation.sql`. Tests: `tests/integration/identity.test.ts`, isolated real PostgreSQL with synthetic fixtures.

Server APIs: `registerPerson(pool, session, contextId, input)` and `lookupPeople(pool, session, contextId, query)`. Each establishes the actor from the current session within its own transaction; callers cannot supply an account/role. `requireStaff` is the internal policy helper for already-verified actors and current capability evidence. It locks the projection and checks organization/membership or direct registration qualification. Test-only grants are never app seed data.

Registration preserves unknown birth date, permits zero contacts/account, does not link shared names/contacts and records actor/context/original institution. Contact verification is independent and defaults absent. Lookup is audited, rate-limited and bounded to10 minimal demographic candidates; it returns no clinical data. Alias is a locator, never a credential. Never expose the private schema through PostgREST.

Consumers: T08 links login to the existing person; T20/T28 call shared registration; T29 uses lookup; T31 must preserve origin IDs/unique aliases and implement a reviewed reversible mapping, not destructive shortcuts. Merge operation columns are reserved and unpopulated. Failures usually originate in schema constraints, missing staff capability or rate counters. No public registration/lookup screen exists until its assigned task.
