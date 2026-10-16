# First-send chat investigation — 2026-10-16

Owner reported Retry reply appearing during sending and first replies failing with: “The AI could not finish this reply. Your message is saved. Use Retry reply to try again.”

## Findings and changes

The button condition explicitly included queued and running. These are processing states, not evidence of failure. chat-view.tsx now shows the button only for failed messages, and hides it while generating the same message.

Saved audit finding 11 was reproduced with the actual ChatView and a failing post-send history request: send succeeded but generate was never called. The history refresh now catches its own failure so extraction and generation proceed. This is a real contributor to first-send failure, but it does not establish the cause of the owner's particular error wording: that wording is emitted inside generate for PROVIDER_UNAVAILABLE or RATE_LIMITED.

A live opt-in integration test against a fresh native synthetic database reproduced PROVIDER_UNAVAILABLE. The configured gemini-3.1-flash-lite endpoint returned HTTP503 on automatic attempts 1, 2 and 3, then the app retained the message and marked generation failed. This test used a newly queued message, no manual retry, no extracted health contributions, and no concurrent extraction call. No real patient data was used. Four non-live chat integration cases passed in that run; the live case failed truthfully on provider availability. Exact cause of every historical user request remains unproven without its corresponding server logs.

The server already retries transient provider errors up to three times with backoff. A later manual retry starts a new attempt window; intermittent upstream availability can explain why it succeeds. It does not prove that a manual click is required by the server. The controlled fresh-message integration case passes on its first generation invocation.

## Relationship to saved audit findings

- Finding 11: independently reproduced and fixed here; it can prevent automatic generation after save.
- Finding 2: ranking can omit relevant evidence, but this live failure occurred with no clinical records. It did not cause this reproduced503.
- Finding 1: authentication throttling does not run in the generation path. Chat's separate send throttle would reject saving before generation; saving succeeded here.
- Extraction workflow, pagination, medication, documents and notification findings do not explain this reproduced provider response. In particular, failure reproduced without running extraction concurrently, so extraction competition is not necessary to cause it.
- The generated typecheck-cache failure is a development verification issue, not evidence of an upstream503 cause.

Other saved issues remain for later work. No model switch, auth/schema changes or hosted data changes were made. No claim that these UI changes repair upstream availability.

## Verification

Before changes, UI regressions failed for queued/running retry visibility and for first generation after a history refresh failure (three failures; three passing cases).

After changes: tests/chat-send-flow.test.ts, tests/integration/chat.test.ts and tests/ai-gateway-retry.test.ts passed fifteen tests, with the live case explicitly skipped in this deterministic run. Separate opt-in live run: four passed, one failed on three upstream503 responses. Lint result is recorded in WORKFLOW.

Google documents503/429 as transient retry cases and recommends bounded exponential backoff and jitter: [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting#retry-strategy). Existing gateway behavior follows that pattern but cannot guarantee recovery during an outage.
