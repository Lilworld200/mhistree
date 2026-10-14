# Supabase email recovery integration research

Historical research checkpoint: the owner subsequently authorized switching MVP auth to Supabase and explicitly deferred no-email login. The bridge proposed below was not implemented. Current source and manual owner-managed configuration steps are in [Supabase setup](supabase-auth-setup.md); later decisions supersede this checkpoint's unselected-provider statements.

2026-10-14. Owner requested researching and adding Supabase email password reset to /recovery. This request reopens the relevant previously deferred email-recovery work; it does not authorize migrating all authentication or removing contactless login.

## Verified findings

- Intended connected project is mhistree, reference wcsizaumvthtkilrqsjr, ACTIVE_HEALTHY. The checkout's configured public Supabase URL matches it. No secrets were printed.
- A read-only call to /auth/v1/settings succeeded: email authentication enabled, email confirmation required, signup enabled. This does not prove SMTP configuration or delivery.
- Current rebuilt login and password setup use Keycloak (`lib/auth/keycloak.ts`, `features/auth/server.ts`), with current application sessions in the private mhistree schema. The preserved legacy Supabase adapter is not an active login adapter.
- Current accounts retain Keycloak subjects. There is no implemented authenticated Supabase-subject-to-account recovery binding or contact-verification transport. Matching an email is not such a binding.
- Supabase's resetPasswordForEmail sends a recovery message for its own existing auth user; updateUser changes that Supabase user's password. It does not change a Keycloak password or retire Mhistree application sessions.

## Required integration decision

Asked owner whether to preserve Keycloak and add explicitly bound email recovery, or perform a broader Supabase authentication migration with a verified contactless adapter. Also requested a developer-controlled mailbox authorized for real delivery testing. No decision or mailbox has been received at this checkpoint. No recovery UI is falsely marked available and no emails, auth users, provider settings or migrations were changed.

The narrower proposed implementation keeps Keycloak: authenticated enrollment first establishes verified contact ownership and a persisted Supabase subject/account/contact-version binding. Recovery verifies a one-time provider recovery proof against that binding, current contact, account state and epoch; grants password-setup authority only; retires old application/provider sessions; changes the actual Keycloak login password through the existing provider adapter. A Supabase session must never grant clinical access or create a second permanent person. Do not synchronize two independently usable passwords. Exact enrollment/provider recovery mechanics need a real integration spike after the owner's decision.

## Acceptance requirements

Real message receipt and callback exchange; existing-person binding; unknown email response does not enumerate accounts; changed/unverified/shared contact denial; one-time/expired/replayed proof denial; retired/merged account denial; rate limits and CSRF; bounded setup scope; old-password and old-session rejection; successful sign-in using the new actual provider password; no-contact recovery unchanged; safe provider-outage retry. Do not count mocked email delivery as passing this gate.

## Sources

- [Supabase password reset](https://supabase.com/docs/guides/auth/passwords)
- [resetPasswordForEmail API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [SSR client/callback handling](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp): default SMTP restricts delivery to organization-team addresses; use configured custom SMTP for other recipients.
- [Current TLS changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated): checked relevant breaking-change notice; supported current runtime HTTPS is not an identified blocker.

Project authority: identity-access contract forbids automatic linking by email; auth contract identifies Keycloak as password/session provider; AGENTS preserves contactless login and requires separate authentication-migration authorization.
