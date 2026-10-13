# Shared Clinical Care: T21-T23 and T28

work.ts owns author private notes, reminders and drafts under direct, organization or initial-care context. It records original patient, author, institution and context/basis. Current access and optimistic versions are required for edit/resume/cancel. Paused work does not resume on reconnection.

entries.ts composes work finalization with the health-records atomic contribution/current-state kernel. Human review is mandatory; source and final contribution preserve attribution and AI-assistance provenance. Correction creates retained version lineage. Failure rolls back the whole transaction; operation keys prevent duplicate finalization.

requests.ts owns named narrow service requests, separately authorized recipients and requested/accepted/in-progress/performed/result-draft/finalized/cancelled/paused transitions. A private note is not an order. publishResult rechecks recipient privilege, current consent, assignment and qualified signed-in contributor. Repeated tests are new requests; corrected results retain versions.

Consumers: practitioner and organization workspace transports/views; patient care renders status/final results through its own authorized projection. Never write an alternate organization-specific timeline/state implementation. Initial-care work has a basis instead of a connection, cannot borrow another provider's history and does not enable AI/request/messaging sections.

Migrations: clinical_work, clinical_finalization/service_requests and organization_initial_care; inspect supabase/migrations for exact ordered filenames. Tests: clinical-work, clinical-entries, service-requests, organization-care, access-records and HTTP direct/organization scripts. WORKFLOW records actual outcomes. Remaining clinical AI and identity procedure launch reviews require named human owners.
