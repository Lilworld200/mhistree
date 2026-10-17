# AI terminal debugger and missing timeline reports — 2026-10-17

Status: implemented and verified locally. Final10-file affected suite49 passed/3 explicit live skipped; full lint/typecheck/production build/client-secret scan and whitespace check passed. Existing conversational voice/journal changes were preserved in the current project checkout. No deployment, hosted mutation or patient-source rewrite.

## Use it

`lib/ai/debug.ts` is the server-only switchable debugger. `AI_DEBUG=1` is enabled in ignored `.env.local`; no other local environment values were changed or printed. Run the usual `pnpm dev` and watch the server terminal for `[MHISTREE AI]`. Reload/restart an already running server if it has not picked up local settings or code. `AI_DEBUG=0` silences the debugger. Development defaults on; production defaults off unless explicitly enabled. Do not add a NEXT_PUBLIC prefix.

Each JSON line has an ISO UTC timestamp, trace ID, elapsed milliseconds and operation. Hashed `messageRef`/`jobRef` fields correlate separate send, extraction and reply requests without printing permanent patient/account IDs, session values or source text. Nested provider operations inherit their parent trace. Interleaved requests retain separate async contexts.

Typical sequence (illustrative event names, not a claimed live trace):

```text
[MHISTREE AI] ... chat.http.action reason=send
[MHISTREE AI] ... chat.message.saved state=queued
[MHISTREE AI] ... extraction.claimed attempt=1 cachedOutput=false
[MHISTREE AI] ... provider.request purpose=extraction model=...
[MHISTREE AI] ... provider.attempt attempt=1
[MHISTREE AI] ... provider.http upstreamStatus=200
[MHISTREE AI] ... provider.response finishReason=STOP promptTokenCount=... totalTokenCount=...
[MHISTREE AI] ... extraction.validation.complete acceptedItems=... issueCount=...
[MHISTREE AI] ... extraction.item.prepared category=activity timePrecision=range
[MHISTREE AI] ... extraction.committed state=succeeded savedItems=1 replayedItems=0
[MHISTREE AI] ... retrieval.complete embeddingUsed=false reason=sql-ranking
[MHISTREE AI] ... provider.request purpose=chat ...
[MHISTREE AI] ... chat.reply.published state=succeeded
```

Extraction and reply run independently, so actual line ordering can interleave. `item.prepared` is inside a transaction; `extraction.committed` is emitted only after commit. Failure logs include static rejection reasons or safe SQL/domain codes and schema identifiers, never raw SQL/error detail. Zero saved items with succeeded means no accepted new fact; zero saved items plus partial means unresolved/rejected work; replayedItems counts existing idempotent events separately from fresh writes.

Provider diagnostics use the response already returned by the normal call: attempts, HTTP status, safe provider status/QuotaFailure flag, finish reason and available usageMetadata counts (prompt/output/total/cached/thought counts). No countTokens, generation, explanation or embedding request is added for logging. Thought **counts** are metadata, not private reasoning text. `MAX_TOKENS` describes the call's output limit;429/RESOURCE_EXHAUSTED with a QuotaFailure detail identifies provider quota/rate rejection. Per-call usage is not a remaining daily allowance or billing balance, and missing fields are not reported as zero.

Prompts, patient messages, extracted clinical text, raw replies, provider error messages/details, cookies, credentials, headers and thought text are excluded by runtime field allowlists. Console failure cannot fail the clinical operation. There is no raw-content switch. Embeddings remain unwired in this chat path; SQL ranking is logged truthfully instead of inventing an embedding phase.

## Investigation evidence

Owner reported three recent chat messages with no timeline saves and asked whether tokens/quota had run out. Confirmed connected project **mhistree**, private project ref `wcsizaumvthtkilrqsjr`, ACTIVE_HEALTHY. Read-only bounded queries inspected the latest message/job metadata, counts, issue classifications and then only those three processing issue strings. No message body, patient name/contact or original clinical document was queried or copied into this evidence file.

Observed: all three replies succeeded; all three extraction jobs were partial after one attempt. Two had zero accepted items. The latest had one accepted activity, finalized visibility/current logical head, with unknown occurrence time. It is therefore incorrect to say absolutely nothing was persisted: unknown dates sort after dated events on the existing timeline. Two partial issues were model spelling-related clarifications; one was the application's journal presentation validator. No quota/provider error appears in these jobs. Historical token counts/upstream details were not recorded and cannot be reconstructed from these rows; no claim of checking a remaining daily token balance.

Code reproduced two recovery/visibility defects: `processReport` ignored200 responses whose state was partial/held; and empty validated output plus issues remained cached, so retry skipped the model and could replay an empty result forever. A separate fragile path looked up a just-sent message in the last50 jobs and silently skipped extraction if absent; this was not established as the cause of these particular three jobs, which had run.

## Fixes and contracts

- `features/ai-chat/extraction/server.ts`: request tracing/stage/error logs; per-item safe reject/hold codes; presentation normalization/quoting instead of rejecting an otherwise meaningful report solely for a missing style flag or full sentence subject. Exact source matching, unknown medication/site ambiguity, relation validation, date compatibility and current authorization remain enforced. Clarifications are not converted into guessed facts.
- Authorized manual retry regenerates a cached zero-item partial result only after checking that no contribution was accepted from that source. Nonempty partial output retains its stable item/source/operation keys and idempotent acceptance, preserving successful items. Identity-held work is not regenerated. Existing attempt limits remain. No automatic extra provider retry was added for logging.
- `app/api/extraction/route.ts` accepts exactly one of `{id}` or `{messageId}`. The latter calls the owning authorized enqueue operation, removing the UI's paginated status lookup dependency. Origin/session/ownership checks stay server-side. Existing job-ID callers keep working.
- `features/ai-chat/chat-view.tsx` requests extraction directly for its saved message and visibly reports partial/held results even when reply generation succeeds. The existing processing disclosure retains job issues and Process/retry. No new page layout or visual design change.
- `lib/ai/{debug,gateway,request}.ts`, chat server/routes and retrieval supply safe stage/model/usage/commit/error metadata; no provider/model switch, embedding feature, schema or authorization change.

Existing two zero-item jobs can now be retried through **Report processing → Process / retry** in the patient's authenticated session. A spelling/body-location ambiguity may still require a clarifying message; the fix does not force it through. The latest partially accepted report remains preserved. No plaintext patient session was available to this agent, no authenticated user browser was exposed in the browser inventory, and no app terminal was attached to this chat. Therefore no impersonated session, admin clinical write, automatic hosted replay or fabricated recovery was performed. The owner's terminal receives new diagnostics when running the updated app; past missing logs are not recoverable.

## Verification and handoff

Read packet: AGENTS/WORKFLOW; AI-chat README/feature map; playbook T11/T12/T16 and Appendices A-D; clinical-records source/time/retry/retrieval contract; active chat/extraction HTTP/UI/gateway/request owners. Supabase skill applied to read-only project inspection; existing provider API verified against [Gemini generateContent](https://ai.google.dev/api/generate-content#UsageMetadata) usage/finish metadata. Supabase changelog Markdown endpoint remained unavailable to the web parser; no Supabase API/schema/library change was required.

Baseline gateway/chat/extraction checks:18 passed/1 live skipped. Focused debugger+gateway+chat+extraction run:27 passed/1 live skipped. New actual NextRequest extraction handler and debugger checks:7 passed; typecheck passed. Wider final suite/lint/build/client scan recorded in WORKFLOW. Tests use native synthetic PostgreSQL or explicit HTTP doubles; no model requests were issued by this task's validation runs, so tests do not claim new provider/quota availability proof.

Regression files: `tests/ai-debug.test.ts` (switch/redaction/concurrency/usage/finish/quota/no-extra-call/console failure), `tests/integration/extraction-http.test.ts` (real handler + native database, direct-message processing and Origin/ownership/schema denial), updated journal extraction tests (empty-cache recovery, idempotent retry, missing style/full subject), updated chat-send-flow tests (partial/held visible despite successful reply). Existing source/date/privacy/version/access regressions remain in the affected set.

Next owner action: reload the updated app, retry the zero-item jobs from the authenticated processing disclosure and inspect `[MHISTREE AI]` lines. Resolve meaningful spelling/location clarifications in ordinary chat. Future debugging starts here plus lib/ai/debug.ts and the relevant owning service; do not log source/credential payloads or equate partial extraction with successful clinical capture. Unrelated audit findings and T32-T36 remain outside this task.
