# Care Inbox hosted database rollout - 2026-10-29

Owner authorized updating the existing database so both inboxes can use the completed messaging workflow. Confirmed project `mhistree` (`wcsizaumvthtkilrqsjr`, eu-west-1, ACTIVE_HEALTHY) matches the application DATABASE_URL project suffix and public project URL. No credentials or real message contents were printed or copied.

## Applied changes

- Applied repository migration `20261028151612_separate_care_inbox.sql` through Supabase apply_migration. Hosted history: `20261029052945`, name `separate_care_inbox`.
- Existing canonical care messages, threads, read positions, recommendation metadata and related policies were inspected first. The older connected-care schema already existed despite having no matching connected-care entry in the reported hosted migration history; it was not reapplied or rewritten.
- Added sender_context, reviewed_event_id, durable care_analysis_jobs and author/context-private care_pending_findings with the prepared RLS, narrow grants and reviewed-recommendation trigger. No historical backfill, clinical publication or deletion.
- Generated local migration `20261029053150_care_inbox_lookup_indexes.sql` using the installed Supabase CLI. Added eight foreign-key/lineage lookup indexes and scalar transaction-context subqueries in the two new policies, preserving row-dependent authorization. Hosted history: `20261029053250`, name `care_inbox_lookup_indexes`.
- No application API, provider selection, credentials, frontend or deployment changes in this rollout. Existing messages and records retained.

## Verification

- Hosted metadata confirms both new tables have RLS and policies; runtime SELECT/INSERT are enabled and anon/authenticated SELECT remains denied. Verified added columns, enabled review guard, eight lookup indexes and both migration-history entries.
- Configured-application PostgreSQL connection passed five LIMIT 0 checks under mhistree_runtime with verified TLS and a read-only transaction, before and after the final migration. No clinical rows read or written. Private helper `.local/inbox-hosted-check.cjs` loads existing server configuration without logging secrets.
- Fresh disposable native PostgreSQL plus HTTP integration suites: 15 passed, 1 optional live-provider test skipped. Repeated after the final local migration was added with the same result. Covers delivery/read isolation, durable failures/retry, pending findings, concurrent reviewed publication, patient report attribution, source timing, scope revocation and privacy.
- Initial sandbox fixture startup failed at pg_ctl; reran outside Windows sandbox successfully. The read-only hosted check initially hit network EACCES in the sandbox and passed through authorized external execution. No application protections were weakened.
- No live user message sent, real-account clinical change, visual/browser repetition or new live AI generation. Hosted metadata checks plus disposable behavioral tests do not claim a new live-account end-to-end test.

## Advisor results and existing limits

Security advisor results were unchanged after the inbox migration: no new inbox security finding. Existing unrelated findings remain: 22 private tables with RLS/no policies, two legacy public functions with mutable search paths, three public-schema extensions, anon/authenticated execution on the legacy public.handle_new_auth_user security-definer function, and disabled leaked-password protection. These were not broadened into this inbox rollout.

Remediation references: [RLS/no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [function search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [anonymous security-definer execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Final performance advisor reports no new-inbox unindexed foreign keys or context InitPlan warnings. Newly created indexes still appear as unused, which is expected before workload and is not a reason to remove them. Other existing database performance findings remain out of scope. [Index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

The skill changelog fetch returned unsupported text/markdown; current Supabase migration and RLS docs were retrieved through search_docs. No provider, realtime subscription or API-contract migration was inferred from that fetch.

Next: the current local app can use the updated hosted inbox schema; a separately hosted frontend still needs its normal code deployment if it is running an older version. Persistent notification delivery and permanent background workers are not added by this migration; existing authorized visit/post-response processing remains.
