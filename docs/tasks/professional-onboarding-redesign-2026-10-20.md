# Independent professional and organization onboarding — 2026-10-20

The owner requested a complete redesign of these entry/application flows, with their own fields, stages and design rather than adapting the patient auth card. This supersedes the earlier shared AccountEntry presentation for professional routes. Patient auth remains outside this redesign.

## Requirements read and research

Read AGENTS, WORKFLOW, playbook T10/T19/T26 and Appendices A–D, the auth/organization contracts, feature READMEs, current routes/services and design guide. T19 requires one existing account extended by manually reviewed qualifications. T26 requires manual organization approval and verified initial administrator authority, separately from clinical qualification. The owner authorizes independent visual design; these functional boundaries still apply.

Primary external references consulted:

- [Medical and Dental Council of Nigeria](https://www.mdcn.gov.ng/frequently-asked-questions): professional registration and practising licence context.
- [Pharmacy Council of Nigeria laws](https://pcn.gov.ng/about-pharmacy-council-nigeria/pcn-laws/): professional and premises regulation are distinct.
- [HEFAMAA facility registration guidance](https://hefamaa.lagosstate.gov.ng/how-to-seamlessly-register-your-health-facility-with-hefamaa/): facility registration, operator authority and professional credentials are different parts of a facility review.

Design inference: use separate individual and organization applications, with human identity/account verification first. Retain the existing MVP application data contract and jurisdiction field rather than presenting one regulator’s local statutory checklist as a universal requirement. No new unused form fields, automated statutory verification, public registry integration or claim that Mhistree replaces regulator registration. Reviewers still need authoritative evidence under the existing review workflow.

## Delivered workflow

| Stage | Healthcare professional | Organization |
| --- | --- | --- |
| Account | Human full name, email, password/confirmation | Responsible administrator’s human name, email, password/confirmation |
| Verification | Email link, resend, existing-account sign-in | Same supported verified email lifecycle |
| Registration | Registered name, profession, registration number, licensing jurisdiction | Registered legal name, registration/licence number, jurisdiction |
| Evidence / authority | Credential PDF, client size/type checks plus existing server content/safety checks | Registered/operating address and applicant role/authority statement |
| Review | Retained summary, edit/back, accuracy and authority declaration | Retained summary, edit/back, accuracy and authority declaration |
| Submission | Existing idempotent application API → pending status/manual review | Existing idempotent organization API → pending status/manual review |

Existing account holders sign in and proceed directly to the applicable application/status. Pending/suspended professional profiles cannot resubmit as a route to clinical access. Rejected professionals may reapply through the existing service. Organization applicants/members see their own organizations and statuses, can check status or register another, and can reach existing invitation acceptance. Clinical and organization permissions remain server-owned. No schema change or new identity provider/account model.

The new presentation uses a wide two-column care-team layout, large introduction, numbered progress rail, distinct sign-in/create-account navigation, role-specific content, conventional labelled fields and review/status panels. Mobile uses a single-column layout with compact progress markers and 16px inputs. Patient auth card markup and styling were not reused.

Code owners: `features/professional-onboarding/{frame,fields,auth-form,application}.tsx`, scoped styles; server composition in `features/patient/account/professional-access.tsx` and `app/(auth)/auth/professional/[entry]/page.tsx`. Auth intent/callback and qualification/organization services retain their existing contracts. Forms disclose that unsubmitted drafts are held in page memory; no misleading autosave promise.

## Verification and limitations

- Production build, full ESLint and browser-bundle secret scan passed. Build includes TypeScript checks and all three professional route forms.
- Final new UI/route set: 16 tests passed across `professional-onboarding`, `professional-entry-ui`, `professional-enrollment-route` after field-label/progress accessibility refinements.
- Earlier scoped routing/access/backend set: 32 tests passed, one explicitly opt-in hosted-provider test skipped, across `professional-onboarding`, `professional-auth-routing`, `professional-layout-guard`, native `workspace-access`, `practitioner-profile`, `organization-approval`, `organization-assignments`, `supabase-email`.
- React DOM tests exercise stage retention, credential requirement, final review declaration, exact API payload, pending status, matching signup passwords, verification transition and failed/successful sign-in. API/router doubles verify client behavior only; native database suites separately verify authorization/approval rules.
- Visual checks used a fresh native synthetic database and local production preview, with provider authentication/chat endpoints blocked. Inspected professional signup/sign-in, organization signup and authenticated organization stages through review; no final browser submission or real identity/document/password entered. At desktop viewport 1280×720 and mobile 390×844, document widths were 1265 and 375 respectively (scrollbars reserved), with no horizontal overflow. Screenshots are full-page captures, not viewport-height claims.
- Screenshots: [professional signup](evidence/professional-onboarding-2026-10-20/professional-signup-desktop.png), [professional sign-in](evidence/professional-onboarding-2026-10-20/professional-signin-desktop.png), [organization review desktop](evidence/professional-onboarding-2026-10-20/organization-review-desktop.png), [organization review mobile](evidence/professional-onboarding-2026-10-20/organization-review-mobile.png). Organization review uses explicitly synthetic values. Final label refinement changed associations, not the layout captured for organization review.

No hosted database changes, real signup/email delivery, production deployment or real regulator review occurred. Email delivery remains dependent on the owner-managed SMTP/callback setup. Formal cross-browser/assistive-technology and contrast certification is not claimed. Existing launch/clinical-review gates remain separate.

## Reproduce a safe local preview

After `pnpm build`, run `node --import tsx scripts/preview-professional-onboarding.mts` locally. It creates a fresh synthetic database, starts production Next at 127.0.0.1:3104 and a provider-blocking proxy at 3105. `/__preview/login` sets only its synthetic test session; it is a test-harness route, never part of the deployed app. `/__preview/logout` clears it. Do not enter real credentials/data. To close cleanly from PowerShell: `Invoke-WebRequest -Method Post http://127.0.0.1:3105/__preview/stop` (no Origin header). The harness stops its own Next child/database; ignored local logs contain no session values.
