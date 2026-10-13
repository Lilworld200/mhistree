# Practitioner: T19-T25

One account extends its patient identity with an independently reviewed professional profile. Profile submission and qualification evidence live in profile.ts; review-view.tsx is restricted review UI. Status is rechecked server-side, including suspended practitioners and direct service calls.

patients.ts owns controlled registration/lookup, independent direct consent and authorized patient lists. patients-view.tsx and workspace-view.tsx use those APIs; workspace-view also accepts an explicit organization/initial-care context from the organizations owner. It never silently retries in another context. Existing changes in these views and workspace transport were preserved when T26 began.

workspace.ts composes permitted record/state and work projections. daily.ts owns direct Today, availability and read-state composition; appointments and messaging retain their shared services. Clinical drafts, finalization and narrow results belong to features/clinical-care; AI assistance belongs to features/ai-chat/practitioner.ts.

Routes: app/clinician and app/api/practitioner. Tests: practitioner-profile, direct-connections, clinical-work, clinical-entries, service-requests, practitioner-ai and care in tests/integration. scripts/verify-direct-http.mts checks real account/qualification/consent/care/result/revocation transport. See docs/tasks/practitioner-phase-evidence.md for recovered evidence and external AI limits.

Human qualification review evidence is mandatory. Test reviewer grants and example.org registry fixtures are synthetic only. Private notes do not enter patient records; reminders/read state are not evidence of completed care. Do not add hospital operations, prescribing fulfillment, audio/video or calendar integrations.
