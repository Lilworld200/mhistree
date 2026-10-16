# Chat resilience fix — 2026-10-16

Owner authorized fixing the diagnosed chat failures. Source changes: lib/ai/request.ts (new bounded transport retry), lib/ai/gateway.ts (transport integration and clinician model), features/ai-chat/practitioner.ts (clinician purpose), features/ai-chat/chat-view.tsx (parallel processing and reply, separate error/status, processing refresh, retry-aware send/navigation disabling). No authentication, database, access, schema or model-name change. No embedding/vector engine added. Reply content is still buffered, source-linked interpretation, with existing authorization rechecks before publication.

Transient provider failures now receive up to3 attempts inside one45-second deadline; exponential1s/2s backoff+jitter honors Retry-After up to10s. Longer quota waits fail promptly rather than running past the generation lease. Abort/permanent error cannot cause repeated provider calls. Server console logs only model, attempt, upstream HTTP status or generic transport reason. Provider error text, prompts, tokens and clinical content are not logged. Exhausted failures keep the saved patient message and display explicit Retry reply guidance.

Record extraction starts independently from reply generation. Extraction status-list errors no longer exit the reply pipeline. UI displays separate processing failure/status and refreshes the extraction view when the task settles. Durable extraction jobs keep their existing retry semantics; no untracked server background promises or new worker were introduced.

## Verification

Five gateway tests passed:503→success,3-attempt exhaustion, permanent403/long429 no retry, cancellation before fetch, clinician/extraction model selection; diagnostic secret/prompt redaction asserted. Native chat/access/timeline/correction suites plus these tests:23/23 passed, including an opt-in real Gemini reply persisted in a synthetic database and no clinical contribution inferred. Live test now reads .env/process fields behind MHISTREE_LIVE_AI_TEST=1, eliminating the obsolete missing .local/ai-config.json dependency.

Browser checks used a separate native synthetic DB/production server with deterministic fixture API faults: (1) generation503 retains exactly one patient message, manual Retry reply succeeds while extraction status is blocked; (2) extraction status503 still permits reply and shows a separate processing notice. Both passed, no page errors. Ignored temporary helper/results: .local/ui-chat-resilience.mts and .local/ui-resilience-results.json. These are UI causality checks, not a live Google availability claim.

A separate live browser attempt exhausted provider retry/deadline and returned503; this is recorded, not hidden. Bounded retries cannot guarantee availability during sustained upstream failure. The independent live native integration test succeeded. Synthetic test servers/databases were stopped. No real patient messages or hosted clinical data were sent or modified during validation.

Lint/typecheck, production build, client-secret scan and whitespace checks passed before documentation. Final check results recorded in WORKFLOW. Google guidance: https://ai.google.dev/gemini-api/docs/troubleshooting#retry-strategy .
