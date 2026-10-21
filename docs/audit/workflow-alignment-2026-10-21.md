# Patient, practitioner and organization workflow alignment

Read-only review requested by owner on 2026-10-21. The owner's explanation is a cross-check, explicitly not a replacement governing source.

## Governing sources checked

AGENTS sections2–8; WORKFLOW current state; identity-access, auth and clinical-records contracts; original49-page Mhistree_AI_Agent_Rebuild_Playbook.pdf (SHA2564FB82A3DB86AEA4DC07E8D3B96C354FF847E4A34C6F0CD99C664F3FB14833C6A), PDF page3 visually rendered/inspected and page35 extracted directly with pypdf, retained full text pages3–7,27–30,34–36; practitioner/organizations/clinical-care/access READMEs and relevant implementation. PDF rendering emitted missing optional display-font warnings but the inspected identity/access page was legible. No clinical data or hosted account queries were needed.

## Agreement

- Ordinary account retains its own patient capabilities (AI, timeline, health records and uploads). An approved professional profile extends that same account, with no second login identity and no patient ownership transfer.
- Qualification/operation privileges describe what an actor may do when a valid patient context exists; they do not themselves select patients or grant a record connection. Registration/application alone does not establish reviewed professional qualification.
- Direct patient access requires the current approved profile/privilege plus active direct connection, consent scope/exclusions/provenance and session. The patient retains their lifetime record independently.
- Organizations have independently reviewed status, human administrators, memberships, operation privileges and patient connections. Organization assignments narrow the patient consent ceiling. Admin authority alone does not confer clinical qualification or universal record browsing. Each contribution retains the signed-in human author and organization context.
- Example: organization patientsA/B/C assigned A/B to doctor1 and C to doctor2; organization membership alone does not grant the unassigned patients. Direct connections remain separate even for a doctor belonging to that organization.
- Shared patient-facing care is a finalized clinical entry/contribution. Author private notes and permitted drafts are separate and excluded from ordinary patient AI/shared retrieval. Finalization is a deliberate reviewed human operation, atomically recording source/event/state with provenance.
- No-connection access is denied. Explicit limited initial-care basis for authorized staff registering an unactivated person is the documented separate case; it opens no other-provider history.

## Implementation evidence and gap

features/auth/workspace-access.ts reads approved own-profile navigation independently of connections. features/practitioner/profile.ts separates requirePractitioner from patient-specific access. features/practitioner/patients.ts restricts directPatients to own connections. features/organizations/assignments.ts checks approved staff/membership and consent exclusions before assignment. The shared can_access function checks current actor, professional privilege, connection/consent and organizational membership/assignment as separate gates; later migrations refine the same policy. features/clinical-care/work.ts and entries.ts retain private-work/finalized-entry separation; features/ai-chat/retrieval.ts uses authorized timeline evidence.

Concrete incomplete capability: features/documents/server.ts uploadDocument sets patientPersonId to the signed-in actor.personId and uses patient context throughout. app/api/documents/route.ts does not accept a direct/organization patient context. No other uploadDocument caller or practitioner upload adapter was found by bounded source search. Therefore clinician upload on behalf of a connected patient is a required workflow gap, not established by current self-upload functionality. Do not work around it by impersonating the patient or changing actor ownership. It needs its own authorized context, attribution and extraction/delivery verification.

This review confirms semantic agreement and the inspected core checks; it is not an exhaustive security audit or release certification. No code/schema/account-permission changes or fresh integration test run. Prior focused25-test checkpoint remains historical evidence; T32–T36 and human reviews remain open. Demo-account provisioning remains the separate previously blocked operation; this explanation was not treated as permission to bypass approval review.
