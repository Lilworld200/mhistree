# Contextual medication conversations and reviewed care messages

Owner-approved implementation, 2026-10-27. Supersedes the single-recipient and latest-message-only draft defaults in the earlier care-action guide. Retains Groq GPT-OSS20B chat, existing voice providers and independent Google embeddings. No extra AI routing request, automatic provider retry or key migration.

## Expected conversation

1. Use bounded active chat plus selective current-authorized timeline recall for health, continuity and date/history cues. Include the dated departing snapshot on the first new/resumed-session reply. Old symptoms are evidence of earlier reporting, not proof they continue.
2. Distinguish general information, clarification, personal clinical review and urgent help in the single structured response. For medication questions, fetch a separate bounded projection of current medication use, prescriptions, allergies, ongoing conditions and baseline, independently of drug-keyword similarity. This is incomplete context, not an interaction checker or personal medication clearance.
3. Ask a caring, useful question. Avoid routine “I'm not a doctor” introductions and the observed unsupported “usually fine if...” assurance. Clarify the reported “co trimazole”/“parastamol” spellings without guessing a medicine or its class. Keep that spelling uncertainty through short follow-ups until the patient supplies a correction. A symptom confirmation is not contact or Send consent. Professional assessment depends on need or patient request, not whether a connection happens to exist. Urgent real-world help takes priority over inbox contact.
4. Discover eligible current practitioners when relevant. An accepted contact offer or explicit request prepares a question. A model action alone cannot authorize message preparation. The draft uses exact patient statements and explicit symptom question/answer pairs; model-selected quotes must match patient text. No inferred medication regimen, diagnosis or assistant assertion becomes a patient statement.
5. Show checkbox cards with multiple selection. Prefer explicitly named unique eligible matches, otherwise the sole eligible recipient, most recently actually contacted eligible connection, latest current consent grant, then stable display/ID order. Unknown or ambiguous named people are not silently replaced. Each selected direct connection gets its own copy; selected organization practitioners share one organization-thread copy, explained in the card.
6. Let the patient edit the nonblank draft, select recipients and tap Send. For typed approval, first show the exact server-owned “Send this message to ...?” question for that draft version. Bind its ID to the displayed card and submitted chat message; editing immediately clears the client binding and saving invalidates the server review. Only a standalone positive next answer to that exact latest question sends. Unrelated answers, expired reviews, stale cards, another conversation and missing/mismatched review IDs cannot send. A negative cancels the pending Send and keeps the draft.
7. Recheck current recipient identity/scope/revision for each connection. Save the message and its delivery receipt atomically through the shared care service, with a stable per-connection operation key. Eligible copies can succeed while other copies fail. Report saved inbox copies and failures truthfully, never read/attention/clinical completion. Retry only unsaved destinations; a lost response cannot duplicate successful copies. Sent body text is frozen; a changed message requires a new reviewed draft. Dismiss cancels remaining sends without deleting delivered copies.

## Code and schema

- `context-plan.ts`, `timeline-search.ts`, `health-context.ts`: bounded topic/continuity routing, relevant recall, independent medication safety projection, observed response guards and exact patient-grounded draft construction.
- `care-action-schema.ts`, `patient-prompt.ts`, `lib/ai/{groq,gateway}.ts`: one strict structured reply; dialogue/action/quotes are private workflow metadata, separate from conversational text.
- `care-actions.ts`, `care-delivery.ts`, `/api/chat/care-actions`: owned private proposals, current discovery, optimistic versions, expiring exact-review claims, destination idempotency and receipts.
- `care-action-card.tsx`, `chat-view.tsx`: editable checkbox cards, autosave/retry, explicit reviewed Send and displayed confirmation binding. Text/history/TTS receive conversational text, not metadata.
- `features/access/patient-controls.ts`: verified-session minimum identity discovery; current eligibility and recency ordering. No identity-table grant or RLS bypass.
- Additive CLI-generated `20261027213652_contextual_multi_recipient_chat.sql`: private dialogue and review-token columns, delivery receipts and confirmation rows, expanded proposal lifecycle. Owning-patient RLS and limited runtime grants; no public/anon/authenticated table access, clinical rewrite or historical backfill.

## Verification and limits

Synthetic local database tests cover the twenty-minute dry-throat/New-chat scenario, source-grounded drafts, symptom/contact/Send distinctions, multi-recipient copies, current revocation and partial retry, organization deduplication, recipient recency, independent allergy context, ownership and expired/missing review tokens. UI tests exercise private edits and reviewed button Send; continuity, notification, speech and shared-care regressions are run alongside them.

Live synthetic Groq auditions revealed incorrect raw drug identity/class guesses, incorrect general-information labels, premature action proposals and repeated offers. Server guards handle the observed cases and application tests exercise those boundaries. A small successful provider sample is only point-in-time evidence; it does not establish clinical reliability, broad safety, unlimited quota or the earlier incomplete 60-case quality gate. No real patient content was used for provider evaluation and no real practitioner was messaged or booked. Device layout and real microphone/chat interaction still require owner testing; source/DOM checks are not visual certification.

Final regression: 89 passed, 8 optional tests skipped across 15 files. The latest UI/helper checks passed 17/17 and routing/context checks passed 14/14 separately. Production webpack build compiled, typechecked and generated 65 pages; final standalone TypeScript noEmit, targeted ESLint and client bundle secret/canary scan passed. The live synthetic three-turn Groq audition passed separately; the broader clinical quality gate remains incomplete.

Applied migrations for this workflow (local file → hosted version):

- `20261027161246_patient_session_summaries.sql` → `20261027162634` (`patient_session_summaries`), earlier continuity prerequisite.
- `20261027195005_patient_chat_care_actions.sql` → `20261027202602` (`patient_chat_care_actions`), reviewed care drafts.
- `20261027213652_contextual_multi_recipient_chat.sql` → `20261027221220` (`contextual_multi_recipient_chat`), this revision's confirmation and delivery workflow.

Hosted migration history was rechecked on 2026-10-28. Do not reapply these migrations under a second filename/version. The owner continuously deploys and tests on Vercel; no claim is made that the application is undeployed. These checks validate the local source and hosted schema, without verifying which source revision the owner's current Vercel deployment contains. Keep the matching source and schema together in the normal deployment workflow.
