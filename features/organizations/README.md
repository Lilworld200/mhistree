# Organizations: T26-T28

Organization redesign 2026-10-20: auth entry now uses the independent `features/professional-onboarding` shell/forms. Authenticated `ApplicationFlow` reads `myOrganizations` and stages legal registration → location/administrator authority → review/edit → pending status; final submission still uses `/api/organizations`. Existing applicants/members see their own organizations/status and workspace/invitation links. OrganizationView remains the management-workspace owner, not the auth application UI. Existing approval, administrator verification, membership and clinical access checks remain authoritative.

2026-10-20 entry: /auth/professional/organization supplies distinct organization login/signup, then reuses OrganizationView/myOrganizations for applications and status. AuthenticatedShell hides organization navigation from patient-only accounts and returns direct unenrolled visits to explicit professional entry. Own applicants, active members and unexpired targeted invitations are eligible for organization/status navigation; invitation acceptance/approval/privilege checks remain server-owned. Entry intent is a return path only, not membership or administration authority.

2026-10-13 closeout: My patients and organizational assigned lists include explicit direct, organization and valid initial-care links. Initial-care records remain reachable while their original basis is valid; activation or canonical retirement removes that path. Follow-up migration 20261013121002 guards merged identities. Invitation role presets only initialize visible privilege checkboxes. Controlled search supports exact alias or bounded name prefix; duplicate flags never reveal candidate history.

Owns organizational status and operational authority, not a second clinical engine. All modules are server-only except named views. Routes validate transport; services independently verify current sessions, organization approval and privilege. Private SQL tables use RLS with no browser grants.

## Code Map

| File                                            | Responsibility                                                                                 | Consumers                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| server.ts                                       | Application, independent review/evidence, initial administrator, status transitions            | /organizations, /review/organizations                     |
| membership.ts                                   | Intended-account invitations, membership version checks, staff authority projection            | /organizations/staff                                      |
| assignments.ts                                  | Login/in-person organizational consent, category ceiling, patient assignment list              | Staff controls and selected care contexts                 |
| care.ts                                         | Shared identity registration/lookup, explicit initial-care basis, authorized record projection | /organizations/register-patient and /organizations/record |
| view.tsx, staff-view.tsx, registration-view.tsx | Existing shared form/button/shell composition                                                  | app/organizations pages                                   |

HTTP owners: app/api/organizations/{route,staff,patients,workspace,assistance}. Workspace delegates draft/finalize/result to clinical-care, appointments to appointments, messages to messaging, AI to ai-chat. Never switch to direct context after organizational denial. Identity assistance belongs to features/identity, credential issuance to features/auth.

## Decisions and Boundaries

- Initial administrator receives organization.manage only. Staff explicitly accept a targeted invitation. Administration neither verifies professional qualification nor grants patient access.
- Ordinary membership editing cannot grant auth.recover. Independent identity review designates recovery staff with retained evidence. A membership privilege replacement removes the recovery projection, requiring a new designation.
- Consent and assignment are separate. Assignment categories must be inside current consent, excluding exclusions. Current clinical qualification is checked for credential-dependent operations.
- Registration supports no contacts or account. Initial care is limited to the registering organization, recorded basis and categories, practitioner and assignment; activation ends that basis. Patient sharing then requires its own consent.
- Removing staff invalidates organizational assignments and pauses dependent work; independent direct connections remain unchanged. Suspension increments connection revisions and retains historical records. Reapproval never restores removed members or resumes work automatically.
- Role selections are explicit privilege lists, not hidden role-based bypasses. Lists are bounded to 100; future pagination must preserve current scope rather than fetch hidden records to the browser.

## Verification and Operations

Migrations 20261012081015, 20261012081249 and 20261012081711; identity review/merge migrations additionally update common policies. Integration tests organization-approval, organization-assignments and organization-care cover independent review, outsider/admin denial, invitation ownership, exclusions, staff removal, no-contact care and attributed organizational result publication. scripts/verify-organization-http.mts exercises the real transport and Keycloak. Synthetic reviewer bootstrap is local-only and not qualification evidence for a real practitioner.

Read WORKFLOW and docs/tasks/organization-phase-evidence.md for actual test outcomes and remaining launch gates. No new hosted deployment is implied.
