# AI/chat diagnostic — 2026-10-16

Owner requested tests/investigation only, no fix. No application source, credential, model setting or schema changed. Temporary ignored helpers/results: .local/ai-chat-diagnostic.mts, .local/chat-diagnostic-results.json, .local/ai-diagnostic-results.json; these may be deleted.

## Environment and provider tests

Read .env model names and confirmed .env.local supplies no AI overrides. Effective process key matched .env without printing it. AI_PROVIDER=gemini, patient/clinician/extraction model=gemini-3.1-flash-lite; embedding=gemini-embedding-001 with768 dimensions.

Four raw Google API probes used only synthetic text: patient generation200/STOP(~3354ms), clinician generation200/STOP(~2425ms), extraction JSON request503/UNAVAILABLE(~5526ms) with Google message that model is experiencing high demand, embedding200/~363ms with exactly768 values. Same model is used for all generation fields; results show intermittent service availability, not an invalid model name/key. Two subsequent current gateway calls returned PROVIDER_UNAVAILABLE; a final instrumented gateway retry returned200/STOP and parsed successfully (~synthetic 19-character response). Raw provider failure details were inspected without persisting secrets.

## Hosted database workflow

Direct verified TLS connection using configured .env. Read only aggregate chat_generations state/error counts (no message bodies or patient identifiers): one failed generation / PROVIDER_UNAVAILABLE. This confirms a generation failure but does not retain the original provider status or prove that original failure was Google's503.

Synthetic person/account/session/conversation/message created inside one rolled-back hosted transaction. Under mhistree_runtime and configured patient session context, conversation creation, patient-message insert, generation/extraction queue insert, audit insert, history read and generation claim passed. No synthetic rows persisted; no patient content read or sent to Gemini.

## Real application pipeline

Separate freshly migrated native test database, synthetic session, production Next server3103, actual /api/chat and /api/extraction routes, real configured Gemini provider (no fixture responses). Create200; send200; history200; extraction status200; process extraction200(~7270ms); generate reply200(~1928ms); history200 with roles patient+assistant and generation succeeded. Input was a synthetic greeting/connectivity request, not clinical data. This proves simple chat processing and response storage; it does not establish accuracy on clinical extraction or a complete clinician-context test. Preview server and native DB were stopped afterward.

## Findings (not fixed)

1. Provider availability is intermittent: Google explicitly returned503 high demand, and gateway calls both failed and succeeded. Existing failed generation is consistent with this but original upstream detail was discarded, so exact original cause cannot be reconstructed.
2. lib/ai/gateway.ts reads AI_PROVIDER/GEMINI_API_KEY/AI_PATIENT_MODEL/AI_EXTRACTION_MODEL only. Practitioner assistance invokes default generate, so uses AI_PATIENT_MODEL; AI_CLINICIAN_MODEL is currently ignored. Identical configured model names hide this difference today.
3. AI_EMBEDDING_MODEL/AI_EMBEDDING_DIMENSIONS are not referenced by current app/lib/features. Current retrieval uses authorized SQL category/keyword/recency ranking; the embedding API works in isolation but is not active chat retrieval.
4. Client waits for extraction before reply generation. This adds extraction latency; caught processing failure proceeds to reply, but extraction status-list failure exits the send pipeline before generation. No evidence of the latter failure was observed in tests.
5. Gateway has45-second request timeout and no automatic backoff/retry; non429 provider errors map to generic PROVIDER_UNAVAILABLE. Generation remains failed with patient message retained and a manual Retry reply control. These generic errors obscure whether failure was upstream503, timeout or another provider issue.
6. Earlier UI verification used intercepted fixture replies, proving layout/interactions only. This diagnostic separately exercised real provider and current API routes.

No fixes were made. Candidate next work, only if owner requests: retain safe upstream status diagnostics, bounded retry for transient503/429, decouple extraction/reply scheduling, and explicitly wire or document unused model settings.

## Follow-up: actual /chat browser and Git trace

Compared 74f3af1..HEAD: no changes to gateway.ts, chat API route, chat server or extraction server in UI restoration d0c31a8. Gateway Gemini factory/model environment selection already present in rebuild integration c689e60. Current path: ChatView send -> /api/chat action send -> /api/extraction -> /api/chat action generate -> retryPatientReply -> generateReply -> aiGateway/GeminiGateway -> AI_PATIENT_MODEL. Extraction explicitly selects purpose extraction and AI_EXTRACTION_MODEL. Neither clinician nor embedding settings is required to generate a patient reply.

Ran a second isolated native DB + production Next server browser test with real Gemini and no intercepted API responses. Real UI create/send/history/extraction/generate all200; assistant reply displayed; no browser page errors or UI alerts. Temporary helper .local/ai-chat-browser-diagnostic.mts/results are ignored and removable. First attempt's overly broad alert selector matched a framework announcement before send finished; corrected test selector to the chat's actual error element, then completed the test. No app change was made.

Snapshot71121bd chat store used /api/ai/chat and streamed body chunks via getReader/TextDecoder. Current rebuilt /api/chat buffers the full response and runs extraction before reply; this changes perceived responsiveness, not provider selection. Original user failure remains attributable only to stored generic PROVIDER_UNAVAILABLE, not a proven original upstream503; intermittent provider failures were independently reproduced. No permanent disconnected-model or browser-send defect reproduced in the successful follow-up.
