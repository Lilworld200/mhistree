# Practitioner AI draft reliability repair

Date: 2026-10-28. Branch: `codex/practitioner-ai-draft-repair`. Status: implemented and verified with the limits below. No deployment or hosted schema change.

## Scope and reproduction

Owner reported that manual Care Notes worked for medications/conditions while Talk to Mhistree failed to chat or prepare editable findings. Read the governing files, practitioner/clinical-care maps, T21/T22/T24, Appendices A-D and clinical/access contracts.

Authenticated local browser sign-in succeeded using owner-supplied credentials (not retained here). Opened Talk to Mhistree and sent a workflow question without creating a clinical finding. The selected NVIDIA model hit its 45-second deadline; the service-unavailable error retained the unsent question. Existing history also showed long clarification lists without draft cards. Stopped visual testing at the owner's request. No reviewed clinical publication was performed in that account.

Disposable synthetic native PostgreSQL/live selected-provider tests separately reproduced a mixed-finding failure: structured `amlodipine` matched the practitioner source exactly, but generated body prose capitalized `Amlodipine`; a redundant narrative substring check rejected the complete reply. The same response classified the condition as `clinical` rather than `ongoing`. Single condition and incomplete prescription preparation/review/publication succeeded in the baseline; provider deadlines intermittently failed other runs. An initial fixture assertion incorrectly counted prescriptions among medication-use/persistent items; corrected it to check their separate prescription projection.

## Changes and boundaries

- `features/ai-chat/practitioner-prompt.ts` owns the explicit conversation/draft policy. Prepare all supplied findings together without waiting for another request; condition findings use ongoing; unknown consequential medicine fields remain editable gaps. Preserve literal names/regimens, explicit certainty, unknown timing and prescription-versus-taking. No guessed brands, added patient-verification gate or implied publication.
- `features/ai-chat/practitioner.ts` retains exact source checks for every structured medicine value. If redundant generated prose lacks that exact value, rebuild it from exact practitioner source quotations and verified fields before presenting the review. Invented or normalized structured values still fail. Invalid upstream JSON/schema now maps to PROVIDER_UNAVAILABLE rather than blaming the practitioner with VALIDATION_FAILED. Safe diagnostics contain only event/reason/category, no text or Zod errors.
- `lib/ai/compatible.ts` allows one bounded 90-second clinician generation; ordinary chat/extraction keep 45 seconds. No extra request, retry, model switch or fallback. This accommodates slower reviewed drafts but cannot guarantee external availability.
- Existing editable card, review version/expiry, scope rechecks, private-note isolation, atomic save and idempotency services remain the publication authority.

## Verification

TypeScript noEmit/incremental-disabled and targeted ESLint passed after implementation. Adapter suite including a simulated 60-second practitioner response versus ordinary 45-second timeout passed 7/7; both paths remain one request each.

New controlled integration cases reproduce capitalization/paraphrase in a combined condition/prescription card, publish through the ordinary reviewed atomic service, reject an invented dose and reject malformed provider output without retaining a failed run. Opt-in `tests/integration/practitioner-review-live.test.ts` uses the explicitly configured provider and disposable synthetic identities for ordinary conversation, condition, incomplete medication and combined findings; reviewed publication occurs only in its disposable database.

Ignored evidence: `.local/practitioner-review/{baseline,baseline-complete,longer-deadline,final-regression}.log` and `synthetic-provider.json`. The JSON contains invented case text only, never account credentials or real patient details. Final results are recorded below.

No UI layout change, real-device certification, production build/deployment, migration or provider-selection change is claimed. After final checks, the owner can retry the existing practitioner conversation; historical responses remain retained.


Final results: initial 10-file regression had 55 passing checks and one existing assertion expecting the exact label `Current writable categories: []`. Preserved that label in the extracted policy; the affected practitioner-entry suite plus connected-care regression then passed 28/28. The final adapter/Talk/legacy-inbox/Care Notes UI rerun passed 22/22. Across the combined verification, 76 distinct checks in 11 suites are covered, including the one opt-in live test exercising four synthetic generation cases and three reviewed publications. TypeScript, targeted ESLint and git diff --check passed. The live combined response again capitalized the medicine in body prose while retaining exact structured source values; the repaired path successfully reviewed and published both findings. It correctly used ongoing for the condition and prefilled its exact name/confirmed certainty. No additional visual tests were run after the owner's instruction.

Reproduction/verification commands (PowerShell; native PostgreSQL requires outside-sandbox execution on this Windows host):

```powershell
$env:MHISTREE_LIVE_PRACTITIONER_REVIEW='1'
node node_modules/vitest/vitest.mjs run tests/integration/practitioner-review-live.test.ts tests/integration/practitioner-chat-review.test.ts tests/integration/practitioner-ai-entry.test.ts tests/integration/practitioner-ai-entry-http.test.ts tests/integration/care-notes-form.test.ts tests/integration/care-notes-http.test.ts tests/talk-assistant-ui.test.ts tests/care-notes-ui.test.ts tests/patient-assistant-ui.test.ts tests/compatible-gateway.test.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run tests/integration/practitioner-ai-entry.test.ts tests/integration/connected-care.test.ts --maxWorkers=1
node node_modules/vitest/vitest.mjs run tests/compatible-gateway.test.ts tests/talk-assistant-ui.test.ts tests/patient-assistant-ui.test.ts tests/care-notes-ui.test.ts --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The first sandbox-native attempt failed at pg_ctl restricted-token startup; the authorized outside-sandbox runs used disposable fixtures. No automatic-approval rejection occurred. Provider timeouts remain external failures; the longer deadline is bounded and does not claim continuous availability. The initial live deadline experiment did not establish that a response would necessarily arrive after 45 seconds. The 90-second behavior is additionally verified deterministically with a 60-second simulated response and no retries. No second provider/model was invoked.
