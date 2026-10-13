# Shared appointments

server.ts owns requestAppointment, changeAppointment, listAppointments and current can_participate checks. One explicit patient/direct/org context is required. SQL care migration enforces clinician and patient interval exclusion concurrently; service version locks prevent stale changes. Patient requests/reschedules/cancels; the assigned qualified provider accepts/declines. Only reschedule accepts replacement time; retries compare target, interval and timezone. Revocation/narrowing pauses pending work; reconnect never resumes it.

Patient transport /api/care and features/patient/care/care-view.tsx reuse these services. T25 supplies provider availability/producer screens and explicit paused-work review. tests/integration/care.test.ts uses labeled provider/connection fixtures; no production booking or notification delivery is claimed.
