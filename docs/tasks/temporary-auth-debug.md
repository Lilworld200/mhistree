# Temporary signup diagnostics

Added 2026-10-16 at the owner's request. This adds logging only; it does not repair the reported 503.

Run the app with `pnpm dev`, then retry signup in the browser. Look in the terminal running Next.js for `[TEMP AUTH DEBUG]`. Logs are enabled outside production by default. `AUTH_DEBUG=1` explicitly enables them; `AUTH_DEBUG=0` disables them. Restart the server after changing environment settings. These logs appear on the server, not in browser DevTools.

Each request has a diagnostic requestId. Stage lines identify origin validation, body parsing, database configuration, flow-cookie encryption key, provider configuration, field validation, database rate limiting/locking, enrollment lookup, Supabase signup/email and saving enrollment. The failure line includes available error code/status and safe database identifiers. Supabase errors are logged before mapping to the generic domain error. Never paste passwords, cookies or request bodies into logs.

Examples: `42P01` means a missing database table; `42703` a missing column; `ECONNREFUSED` a connection refusal; `CONFIGURATION_REQUIRED` at flow-cookie-key means inspect AUTH_FLOW_COOKIE_KEY. A provider error code/status at supabase-create-and-send-email indicates the provider rejected the request. These are diagnostic interpretations, not a confirmed root cause of the current 503.

Removal: search `rg temporary-debug app features lib tests`, remove the import/calls in the auth API route, features/auth/email.ts and lib/auth/supabase.ts, unwrap withAuthDebug in the route, and delete lib/auth/temporary-debug.ts and tests/temporary-auth-debug.test.ts. Remove AUTH_DEBUG if set. No migration or database cleanup is required. This diagnostic document may then be deleted.
