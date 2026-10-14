# Supabase email authentication: manual configuration

Owner decision: 2026-10-14. Active MVP signup/login uses Supabase email/password; organizations/practitioners can still create patient records without credentials. No-email login and phone/SMS implementation are deferred. Owner explicitly chose to configure SMTP and callback URLs manually. This guide contains no credentials.

## 1. Configure Resend sending

1. In Resend, add and verify a sending domain you own, using the DNS records Resend supplies. Use a sender address on that domain, not a Gmail From address. Create an API key with sending access.
2. Open the Mhistree project [Authentication → Emails → SMTP Settings](https://supabase.com/dashboard/project/wcsizaumvthtkilrqsjr/auth/smtp).
3. Enable custom SMTP and enter:

| Setting | Value |
| --- | --- |
| Host | smtp.resend.com |
| Port | 465 |
| Username | resend |
| Password | Your Resend sending API key |
| Sender email | An address on your verified sending domain |
| Sender name | Mhistree |

Save these credentials in Supabase's settings, never in this guide or client code. No application Resend key is needed for this flow: Supabase sends through its configured SMTP service. Review Authentication → Rate Limits for the sending capacity you want. Supabase's built-in default sender restricts delivery to organization-team addresses; custom SMTP is required for arbitrary Gmail/other users.

References: [Resend SMTP](https://resend.com/changelog/smtp-service), [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 2. Configure URL redirects

In Supabase Authentication → URL Configuration, set Site URL to the actual application origin and add these exact redirect URLs. For the repository's local development server:

```text
Site URL: http://127.0.0.1:3101
http://127.0.0.1:3101/auth/confirm
http://127.0.0.1:3101/recovery/update
```

For deployed users, replace the local origin with your actual HTTPS website origin and add both paths there. localhost and 127.0.0.1 are different origins; keep APP_ORIGIN, the URL you open and allowed callbacks consistent. A local callback cannot serve people accessing your deployed site from another device.

In Authentication → Providers → Email, enable email/password and require email confirmation. In Emails → Templates, retain the default `{{ .ConfirmationURL }}` links for Confirm signup and Reset password. These routes consume Supabase's default implicit access-token fragment; do not replace templates with a custom token_hash/PKCE callback that this implementation does not use.

References: [password authentication](https://supabase.com/docs/guides/auth/passwords), [redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## 3. Configure the app

Use ignored .env/.env.local or your deployment's secret settings:

```text
NEXT_PUBLIC_SUPABASE_URL=https://wcsizaumvthtkilrqsjr.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<Mhistree publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Mhistree server-only key>
DATABASE_URL=<private app database connection>
DATABASE_SSL=verify-full
APP_ORIGIN=<exact website origin>
```

The legacy anon key is supported only as a fallback if the publishable key is absent. Never prefix the server key with NEXT_PUBLIC_. Restart the app after changing environment configuration. Dependencies are pinned in package.json/pnpm-lock.yaml.

For an isolated local synthetic app DB, run `pnpm exec tsx scripts/prepare-local.mts`; it writes local DB/origin values and applies the repository migrations only to that synthetic instance. It does not copy/migrate hosted clinical records. The new private-schema migration is `20261014004229_supabase_email_auth.sql`; apply it through a reviewed migration process before running this source against an existing deployed app database. No hosted patient-data migration was performed here.

## 4. Verify your real email flow

1. Open /auth and sign up using an email you control, name and a password of at least 12 characters.
2. Verify receipt, click Confirm signup, and confirm the browser reaches /auth/confirm and then your own record/chat. Unverified email must not grant access. If the email is delayed, use Resend verification email.
3. Sign out and sign in using that email/password.
4. Use Forgot password? → Reset by email. Open the email link on the same application origin; /recovery/update asks for the new password and confirmation.
5. Confirm new-password sign-in succeeds, old-password sign-in fails, and a previously signed-in tab has lost access. A reused reset proof is rejected.
6. Check Supabase Auth and Resend delivery logs if a message fails. Do not disable email confirmation to bypass SMTP problems. The app reports a delivery/configuration failure rather than fabricating a successful send.

Users may use their own Gmail or other mailbox; this is not limited to one developer/test address once custom SMTP is configured. Gmail here means an email/password account with a Gmail address, not Google OAuth. Google social sign-in has not been added.

## Evidence and boundaries

Native PostgreSQL tests cover subject binding, no account before verification, original staff-person preservation, confirmation concurrency/replay, reset replay/stale-token/session denial and provider outage. The opt-in real Supabase lifecycle test uses one temporary synthetic auth user, generates a real recovery OTP without sending mail, changes its password, rejects the old password and cleans up that exact user. This does not prove inbox receipt. Owner manages delivery/callback configuration and the real inbox verification above.

Prior Keycloak accounts are not silently linked by email. A reviewed staff recovery/setup approval can transition an existing Keycloak account to verified Supabase ownership while retaining person/account IDs and a transition journal. Unmapped existing Supabase accounts require identity review. Original data is not deleted. Callback tokens are cleared from the URL fragment and never stored in app tables; hashed opaque app sessions remain the authority for private records.

Phone support: Supabase supports phone/password and phone OTP, but needs enabled phone auth plus a configured SMS provider (e.g. Twilio, Vonage or MessageBird). No phone signup or SMS delivery is implemented in this email-first MVP. [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login).
