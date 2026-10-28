# Reversible development provider selection — 2026-10-28

Status: implemented, selected locally and verified with real provider calls on synthetic records. Existing uncommitted identity/episode changes are retained. No hosted migration, real patient-record test, model-terms UI acceptance, account billing change, real care message, booking or deployment.

## Intent and boundaries

Owner authorizes choosing NVIDIA_API_KEY or OPENROUTER_API_KEY from existing ignored configuration, trying the specified free OpenRouter candidates (Inkling, Gemma4 31B, preferred Nemotron3 Ultra550B), and switching chat with an explicit way back to Groq. Required behavior: stored name/nullable DOB on request; bounded authorized timeline recall across chats; repetition versus new observation versus correction; appropriate professional assessment/contact preparation and patient-reviewed Send. Speech stays Groq; Google embeddings remain independent. No automatic model/provider fallback, extra AI routing call or reduction in clinical/context functionality.

Read governing AGENTS/WORKFLOW, T11/T12/T14–16 and Appendices A–D already used in this repair thread, AI-chat/clinical-record owners/contracts, original NVIDIA research, current gateway/voice factory, strict response schemas, clinical extraction/context, care proposals/deliveries, existing native fixtures and prior regression evidence. Latest explicit owner provider instruction supersedes the earlier keep-Groq selection default for this development configuration. Existing private-source and reviewed-care boundaries remain.

## Discovery and candidate evidence

Only key presence, model IDs/capabilities and safe request results were printed. Key values and cookies never enter logs or committed files. Live calls used invented identity/health/recipient fixtures, never production/account history.

Both keys are present. Authenticated catalog reads returned200. OpenRouter listed the three requested IDs as zero prompt/completion price. Inkling and Ultra do not advertise response_format; Gemma advertises it. NVIDIA listed direct Ultra550B and Lightning30B endpoints.

One bounded synthetic full-policy identity+dated-recall+contact audition per candidate:

| Endpoint/model | Observed result |
| --- | --- |
| OpenRouter thinkingmachines/inkling:free | Configuration/access HTTP failure; not a quality verdict. |
| OpenRouter google/gemma-4-31b-it:free | Rate-limited; not a quality verdict. |
| OpenRouter nvidia/nemotron-3-ultra-550b-a55b:free | Valid strict local reply; correct invented name/DOB/date; offered contact preparation, action null. |
| NVIDIA nvidia/nemotron-3-ultra-550b-a55b | Valid strict local reply; correct invented name/DOB/date; offered contact preparation, action null. |
| NVIDIA nvidia/nemotron-3.5-lightning-30b-a3b | Valid reply/proposal; broader26–27 date wording despite a26th-day source. |

Raw action=null is not a failed application workflow: explicit patient contact requests pass the existing deterministic preparation gate, which can prepare a private source-grounded proposal without granting Send. Direct NVIDIA Ultra is the selected candidate for full service testing: it serves the owner's preferred model and passed the initial structured identity/recall checks. This small audition is not an overall model ranking or unlimited-capacity claim. Ignored review: .local/provider-evaluation/{candidates.json,*catalog.json}.

## Implementation

- `lib/ai/compatible.ts`: fixed HTTPS endpoints for NVIDIA/OpenRouter, explicit single model, no retries/fallback,45-second cancellable deadline,256KiB streamed payload cap, bounded complete outputs, safe error mapping and strict existing patientReply validation. Reasoning fields are ignored; inline reasoning tags/incomplete/malformed replies are rejected. Free-only OpenRouter IDs prevent accidental paid model selection. OpenRouter provider fallbacks are explicitly disabled. Models without response_format receive the required schema in the same generation prompt; local schema/source/authority validation is unchanged. NVIDIA and supported Gemma use JSON-object response mode. Server debugger and request-instance observedUsage hold only safe counts, never source or private reasoning.
- `gateway.ts`: AI_PROVIDER selects groq/nvidia/openrouter/gemini explicitly. Alternate providers require their own server key plus AI_NVIDIA_MODEL or AI_OPENROUTER_MODEL. Missing/unknown configuration fails closed; no fallback. Groq ignores alternative model settings, so rollback is one provider-setting change.
- `speech/config.ts`: independent AI_SPEECH_PROVIDER, defaulting to Groq for alternate chat providers and retaining legacy explicit Gemini compatibility. Embedding configuration/callers unchanged.
- `scripts/check-client.mjs`: both new key identifiers join the existing client-bundle secret/canary scan. `.env.example` documents settings without secrets.
- Live service tests use disposable native PostgreSQL, existing verified synthetic app sessions and real selected-provider calls. They exercise actual generation/retrieval/extraction/proposal/publication services rather than injected model answers. Existing deterministic access, UI, speech and care regressions remain complementary evidence; fixtures do not claim a real Supabase account login or browser review.

## Extraction defect found by live evaluation

The first full Ultra run accepted the sleep report and one repeat, then held a third repeat. Inspection of invented returned output showed timePhrase="that same sleepless night". The parser recognized same-incident run/session references but omitted references to an already established night, causing a conservative unknown-time conflict. Expanded explicit same/earlier temporal references (including sleepless/restless night) preserve the original event time for the validated same-report relation; they never establish a date for a new episode. Prompt now says use empty timePhrase for such repeats and never copy timing words absent from the current source. Source matching, separate-episode date checks and current-head/version checks remain intact. Added deterministic repeated-night coverage. The repaired five-check live service suite then passed once; expanded final checks/repeats are recorded below after completion.

## Selection, rollback and verification

Selected local settings (also shown in `.env.example`):

```
AI_PROVIDER=nvidia
AI_NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
AI_SPEECH_PROVIDER=groq
```

Existing NVIDIA_API_KEY/GROQ_API_KEY/Google embedding settings remain untouched. To roll back chat, set AI_PROVIDER=groq and restart/redeploy the application; no code/schema/data rollback or key migration is needed. Local .env does not configure Vercel: set the same selected-provider/model/key values in its server environment and redeploy explicitly when desired. No hosting change is claimed here.

Initial adapter/Groq/context regression21/21 passed; extraction/episode/journal/time regression23 passed/2 optional skipped. Live reviewed-care flow passed: everyday tiredness produced no proposal/message, persistent limiting fatigue prompted assessment, an explicit named request produced an editable eligible-recipient draft, no alert preceded Send, concurrent reviewed confirmations saved one message and one unread indication. Initial repaired five-check identity/episode live suite passed once. Final expanded tests, exact usage, lint/type/build/client scan and remaining limits follow in the completion record.

Primary current references: [OpenRouter catalog](https://openrouter.ai/api/v1/models), [structured outputs and endpoint capability differences](https://openrouter.ai/docs/guides/features/structured-outputs), [NVIDIA Ultra](https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b), [earlier NVIDIA provider research](nvidia-api-research-2026-10-27.md). The owner's testing intent and API-key authorization do not constitute a new provider contract or completed launch/clinical review.

## Final evidence and handoff

- Selected direct NVIDIA `nvidia/nemotron-3-ultra-550b-a55b`; local ignored `.env` changed only provider/model/independent speech selection. Existing key values and Google embedding configuration remain. No automatic fallback.
- Core five-check real-service run passed after the repeated-night repair. Expanded identity/timeline suite then passed twice: `.local/provider-evaluation/nvidia-ultra-expanded-repaired1.log` (combined2/2) and `nvidia-ultra-final-repeat.log` (core1/1). These cover stored name/DOB, nullable DOB, first/later generic timeline requests, three repetitions as one retained logical report, unchanged morning pain plus linked resolution, subsequent conversation, exact cross-chat symptom no and successful empty hypothetical extraction. Source/authority checks remain actual service checks, not model-mocked results.
- Real selected-provider care workflow passed repeatedly, including both five-call runs in `care-review-pass1.json` and `care-review.json`: routine tiredness no unsolicited message; persistent limiting symptoms prompt assessment; explicit named contact yields editable grounded draft/current eligible card; only reviewed Send writes one shared message/unread count under concurrent confirmation; urgent chest/breathing symptoms prioritize real-world urgent help; uncertain drug name prompts exact-name clarification.
- The hypothetical repair passed again as a targeted real-service case (`hypothetical-repeat.log`,1/1). No medication use was invented and no timeline contribution was accepted for the conditional question.
- Final successful repeated verification datasets comprise35 successful responses:75,895 prompt +4,698 completion =80,593 observed tokens (24 core,10 care,1 targeted). These figures exclude earlier auditions, failed/repaired exploratory runs and any usage not returned by the provider; they are not total account consumption or remaining capacity. Original response counters/usage: `services-usage-pass{1,2}.json`, `care-review{,-pass1}.json`, `hypothetical-usage.json`.
- Intermediate runs included45-second provider timeouts even outside the network sandbox. Those failures remain recorded; the application did not retry or switch providers automatically. A clean repeat passed, but free-endpoint availability/latency is not guaranteed. The earlier hypothetical clarification was a model-output instruction defect; no false clinical entry was written while it was partial.
- 16-file native/UI/context/continuity/extraction/care/speech/embedding/adapter regression115 passed/3 optional skipped; final adapter6/6 passed separately, including oversized-stream cancellation. Full ESLint and standalone TypeScript passed. Final isolated production webpack build exited0, typechecked and generated65 pages; server-only identifier/canary client scan passed. All237 current TypeScript production files match the built source byte-for-byte. Final whitespace check passed.
- Local production preview is running at `http://127.0.0.1:3000` with the selected settings: `/auth`200; unauthenticated `/api/chat`401. The development server's initial compilation exceeded the read timeout; the owned preview was replaced by the verified production build for this local check. It uses existing configuration in process memory; keys were not printed or copied into tracked artifacts. No authenticated real-user/browser/device acceptance or Vercel deployment was performed.

To reproduce synthetic verification (requires existing keys and native test PostgreSQL), run:

```sh
MHISTREE_LIVE_IDENTITY_EPISODES=1 MHISTREE_LIVE_PROVIDER_CARE=1 MHISTREE_EVAL_PROVIDER=nvidia MHISTREE_EVAL_MODEL=nvidia/nemotron-3-ultra-550b-a55b node node_modules/vitest/vitest.mjs run tests/integration/chat-identity-episodes.test.ts tests/integration/provider-care-live.test.ts
```

The live tests create their own ignored review directory and disposable patient fixtures; never replace them with retained real-patient records. For a future provider comparison, read this record and the original identity/episode record first, retain all successful/failure evidence and preserve current publication/review boundaries. No additional API calls are needed after the passing checks. For Vercel, explicitly configure the selected server key/provider/model and independent speech setting and redeploy through the normal owner workflow; this local preview does not establish hosted deployment state.

## New chat navigation compatibility

One additional real-provider test exercises the normal changed-departure path rather than creating unrelated empty conversations: topic title generation, source-cited private summary preparation, then a new-session reply. All three calls passed with NVIDIA Ultra (`continuity-live.log`,1/1). The source-grounded summary retained the break/food/uncertain symptom context; the reply asked naturally about the day after the break without asserting continuing pain or recovery. Actual usage:2,813 prompt +346 completion =3,159 tokens. Combined final verification is38 successful responses /83,752 tokens (78,708 prompt,5,044 completion), still excluding earlier probes and failures. Review `.local/chat-continuity-live-review.json` contains invented sources only.

The continuity live test now accepts an explicitly selected NVIDIA/OpenRouter provider while retaining its previous explicit Gemini default, and all live tests create their ignored review directory on a clean checkout. No new production behavior was changed after the final build. Updated fixture-only TypeScript/lint checks passed separately. The local production preview remains available for owner review; no additional provider calls or deployment were performed after the final checks.
