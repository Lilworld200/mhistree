# Professional and organization onboarding

Owner revision, 2026-10-21: registration only. All users sign in at `/auth`. Public registration and authenticated applications use Mhistree’s existing centered auth-card layout, original logo, shared tokens, floating-label AuthField and pill buttons. This supersedes the independent visual design and separate sign-in requested on 2026-10-20.

## Routes and owners

- `/auth/professional?entry=practitioner|organization`: registration entry alias; `ProfessionalAccess` redirects existing accounts to their own application. No separate sign-in UI. `auth-form.tsx` owns account creation, matching passwords, verification guidance and resend.
- `/auth/professional/signup?entry=...`: individual or administrator account creation, then email verification. `features/auth/entry-path.ts` and existing callback own allowlisted return intent; it never grants a role.
- `/auth/professional/{practitioner,organization}`: authenticated server route reads own profile/applications or organizations, then `application.tsx` stages the application. Approved professionals continue to the clinical dashboard.
- `frame.tsx`: shared account-card header, compact progress and review note. Registration type comes from the separate links on patient signup; there is no practitioner/organization toggle. `fields.tsx` reuses patient `AuthField`, retaining associated hints and password visibility. `styles.css` uses global Soft-Float tokens and is imported directly by `app/layout.tsx` (avoid the previously failing Tailwind CSS import).

## Stages and retained data

Professional: own account → verify email → registered name/profession/registration number/jurisdiction → credential PDF (5 MB maximum) → review/edit/declaration → pending review. Final API is `/api/practitioner`; server checks PDF content, current session and idempotency. No frontend choice grants qualification or privileges.

Organization: own administrator account → verify email → registered legal name/registration or licence number/jurisdiction → operating address/administrator authority statement → review/edit/declaration → pending review. Final API is `/api/organizations`; existing services own approval and administrator verification. Existing applicants/members see their organizations/status and authorized workspace links. Staff invitation acceptance remains a separate existing operation.

Drafts and selected credential bytes remain in component memory until final submission; Back retains them. Reload/navigation can discard an unsubmitted draft, as disclosed on the form. Passwords are reset after successful signup and are never saved in drafts. Stable request keys and a submission lock prevent accidental repeated writes; errors retain input and offer a status refresh. No database migration, new identity, provider change, auto-approval or automatic clinical access.

Tests: `professional-onboarding`, `professional-entry-ui`, `professional-enrollment-route`, `professional-auth-routing`, `professional-layout-guard`, plus native `workspace-access`, `practitioner-profile`, `organization-approval`, `organization-assignments`, `supabase-email`. Evidence/research: [task record](../../docs/tasks/professional-onboarding-redesign-2026-10-20.md).
