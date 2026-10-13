# Patient AI chat

`server.ts` owns conversations, paginated history, idempotent sends, generation leases/retry and cancellation. Message capture commits before AI calls. Replies are distinct assistant rows and never automatically become clinical events. SQL migration durable_patient_chat adds patient-only RLS. `/api/chat` is the thin cookie/Origin transport. `chat-view.tsx` composes preserved shell primitives, durable history and retry controls.

`lib/ai/gateway.ts` is the server-only configured Gemini boundary. Current provider/model are reused from the owner-authorized legacy AI configuration; no model fallback, tools, raw errors or secrets are sent to clients. Responses are buffered and authority is rechecked before publication. Leases recover after process loss; bounded attempts prevent endless automatic retries. Cancellation withholds output, even if a provider request has already run.

`extraction/server.ts` owns durable extraction jobs, validated item journal, stable source/item identity and per-item atomic record acceptance. Successful partial items survive retries. `extraction/time.ts` anchors supported relative phrases to original capture time/timezone. Sources link to original patient messages; assistant messages cannot become evidence. Unknown medication/other-leg ambiguity remains visible. T13 adds document producers; T14–16 consume accepted source-linked events and state.

Tests: integration/chat.test.ts includes real gateway generation and SQL isolation; injected adapters are explicitly failure/cancellation controls. extraction.test.ts covers model output, temporal interpretation and replay. Missing provider configuration or errors remain failures rather than fabricated replies.
