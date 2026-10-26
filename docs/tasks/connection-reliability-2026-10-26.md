# Connection reliability — 2026-10-26

Owner explicitly approved the three targeted solutions, implemented in order1,3,2. No application rewrite, schema/provider migration, hosted configuration change or clinical-data mutation is part of this maintenance. Governing packet read: AGENTS/WORKFLOW, playbook T08/T09/T21–24/T33 and appendices, auth/access/clinical/practitioner/health owners and contracts. Supabase connection guidance informed retention of session pooling; node-postgres guidance informed ownership and error monitoring.

## Changes and boundaries

- One `globalThis` registry per process retains pools across module reloads. Ordinary work has six connections; credential session locks have two. Configuration fingerprint changes fail closed until restart. These limits apply per process, not across replicas.
- Explicit lock dependencies reach signup/setup/reset/issuance/completion and staff assistance. Session advisory locks retain their original keys and provider serialization. Unlock failure destroys the connection, including when the operation also failed; original operation errors survive cleanup failure.
- Acquisition permits one100ms-delayed retry for recognized transient connection establishment failure before BEGIN. Each attempt retains the existing five-second connection deadline. Pool queue timeout, auth/TLS errors and transaction work are never retried. A lost COMMIT response remains an uncertain outcome requiring normal operation status/idempotency checks.
- Idle pool errors and physical client lifetime errors are handled. Broken clients are discarded on release, including disconnects between queries. Rollback failure cannot leak a checked-out client. DATABASE_UNAVAILABLE produces recoverable API/UI messaging. Generic page errors expose retry without claiming unsent/saved status.
- DB_DEBUG=1 logs connection create/remove, checkout elapsed time and pool total/idle/waiting counts. Client/idle faults log safe counters/codes even when disabled. Logs exclude SQL, raw error payloads, credentials and clinical text.
- Patient server render shares only request-local auth, loads an authorized profile snapshot and supplies it to the client. Workspace reads use one current-context transaction, restricted role/RLS/category checks and audit. The optional privileged identity preparation is restricted to the existing minimum demographics/approved practitioner/own active connection checks.
- Focused profile/work/requests/messages reads reduce unnecessary private-content loading. Legacy full HTTP response remains default `all`; existing service callers retain `record`. Timeline stays paginated and focused. Page and active panel have one visible15-second/focus controller with no concurrent requests; mutations still verify current authority, with no replay. Revision changes/read failures clear sensitive panels; failed care saves retain unsaved form input when authority remains valid.

## Measured verification

Synthetic native PostgreSQL instrumentation compares the actual service paths, not hosted patient records:

| Path | Before | After |
| --- | --- | --- |
| Initial auth/navigation/profile plus duplicate client load |12 checkouts /88 SQL statements |3 checkouts /25 statements |
| Page plus open work-panel refresh |12 checkouts /98 SQL statements |1 checkout /19 statements |

Initial SQL falls71.6%; work refresh SQL falls80.6%. Initial render's three include auth, navigation and one profile transaction; React StrictMode client regression proves no immediate duplicate GET. These are bounded synthetic service measurements, not a claim about end-to-end production latency or all panel sizes.

Regression coverage: separate two-lock/six-work pool under eight concurrent auth operations; unlock/rollback fault cleanup and original error preservation; acquisition-only retry versus saturation/auth failure; reload pool reuse; safe diagnostics; native idle and checked-out socket termination followed by clean recovery with no transaction replay; focused/legacy transport validation, other-actor/revocation/category/private-record denial; serialized refresh/focus/StrictMode/view changes; unsaved clinical input retention.

Final check results are recorded in WORKFLOW. The optional live account-mutation test is disabled. Historical Keycloak integration suites require missing local provider configuration/runtime and were not claimed as executed; active Supabase tests use a controlled provider adapter with real disposable PostgreSQL. No browser visual verification was required for this data/connection change. Original intermittent hosted establishment timeout was not reproduced; prior read-only connectivity succeeded. Network/provider outages can still occur and return the recoverable unavailable state.

## Operations and maintenance

Restart the application once after adopting this code to retire old module-scoped pools. Keep the existing verified-TLS session-pooler connection; transaction pooling is incompatible with these session advisory locks. Use DB_DEBUG briefly when investigating checkout waits; consider replica count when budgeting total sessions. No credential, SQL or clinical text should be added to diagnostics. Do not broaden retries to BEGIN/work/COMMIT, cache authority across requests, add an independent care-panel polling timer or bypass the restricted clinical callback.

Source owners: lib/db/client.ts, diagnostics.ts, lib/auth/patient.ts; features/auth/credential-lock.ts, email.ts, server.ts and identity/assistance.ts; practitioner/workspace.ts, use-patient-workspace.ts, patient-detail-view.tsx, workspace-view.tsx; shared access/clinical-care/messaging/health in-transaction readers; relevant auth/staff/workspace transports. API and clinical mutations preserve existing contracts.

References: [node-postgres pool](https://node-postgres.com/apis/pool), [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres#transaction-mode-limitations). Existing full launch/recovery/provider-delivery/human review gates remain separate.
