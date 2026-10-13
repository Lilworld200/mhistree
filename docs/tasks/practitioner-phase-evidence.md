# Recovered T19-T25 Evidence

The 2026-10-12 resume traced the owner-saved implementation at 0e8081b and the dirty practitioner files; it did not restart T19-T25. Earlier WORKFLOW paragraphs and not-started ledger rows had not caught up with code. This record distinguishes recovered implementation from fresh verification.

T19 professional same-account submission/review, T20 direct lookup/consent/registration, T21 private work, T22 atomic finalization/correction, T23 narrow requests/results, T24 AI human-review assistance and T25 Today/availability/messages are present in features/practitioner, clinical-care and ai-chat. Their READMEs and the feature map identify owners.

Fresh real HTTP acceptance scripts/verify-direct-http.mts passed credential review, pending denial, patient approval and recorded consent, appointment acceptance, two-way durable messaging/unread state, private-note isolation, finalized entry/result patient visibility and revocation denial. The script's original revoke field connectionId was corrected to the actual API field id; no application authority bypass was introduced.

Initial full 62-test regression passed 54, with eight provider tests failing because Keycloak was stopped. Restarted real provider and affected auth/account tests passed 10/10. Later expanded regression outcomes are recorded in organization-phase-evidence.md. T24 live AI requests have intermittently returned PROVIDER_UNAVAILABLE; this is not replaced with mock provider success. A dependent assertion in the practitioner-AI file can cascade after the first provider failure.

All tests use synthetic records. Existing dirty practitioner route/work/view changes and practitioner_audit_hardening migration were retained. No production clinical qualification, clinical AI review, delivery configuration or launch approval is inferred from local automated evidence.
