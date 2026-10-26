# Reviewed microphone messages and read-aloud replies

Owner approved the STT → editable transcript → explicit Send → ordinary chat → TTS plan on2026-10-26. This is patient/AI voice messaging, not an audio consultation or an always-listening Live session.

## Behavior and ownership

- `features/ai-chat/speech/recording.ts` captures locally through a same-origin AudioWorklet, detects audio activity and stops after5 seconds of inactivity or60 seconds total. Manual Stop drains queued samples; Cancel/page hide/navigation/unmount releases microphone tracks, audio nodes and buffers. Activity detection is an amplitude/noise heuristic, not a verified speech classifier; silent recordings and empty provider transcripts are discarded too. Only mono16kHz16-bit WAV is uploaded; browser-specific WebM/MP4 recordings are avoided.
- `use-voice-chat.ts` owns recording/transcription/playback states, cancellation, autoplay-blocked Play controls, and a five-reply memory-only audio cache. Typed messages/history never autoplay. Recording stops playback; it never automatically reopens the microphone. Cached replay checks current ownership of that specific saved reply and the current authenticated session, preventing cross-account reuse after a browser session change. New recording, requests and playback failures leave text chat usable.
- `schema.ts`, `config.ts`, `gateway.ts`, `server.ts` and `/api/chat/speech` own bounded uploads, verified transcript receipts and provider access. Normal chat retains its current reply/extraction models. STT is `gemini-3.5-transcribe` with verbatim mode; TTS is `gemini-3.8-flash-lite-tts`, Sulafat, with delivery style in separate speech metadata. REST Interactions uses inline audio and `store:false`; no Files upload or permanent audio store. One explicit speech action makes one provider attempt;429 is returned without automated replay. Provider response size and generated audio are bounded.
- `chat-view.tsx` puts the transcript into the composer for review/edit and marks the submitted message with `inputMethod:microphone`. Existing extraction runs only after explicit Send, using reviewed content. A signed/encrypted ten-minute transcript receipt is bound to the verified account/session and checked on Send. It retains original machine text, provider/model, server capture timestamp, duration and audio SHA256; provider transcript is not clinical confirmation. JSON metadata persists alongside submitted content, without receipt tokens or session/account identifiers. The patient can inspect original machine wording in Message details.
- TTS requests contain only a saved assistant message ID. Server derives the exact text via current patient RLS and verifies that its parent was a microphone message, both before and after the provider call. Client-supplied text, voices and models are rejected. No clinical or practitioner-messaging authority is added. Delivered audio is a private copy; the app cannot promise remote recall after delivery.

## Migration and deployment order

Apply `20261026212607_patient_microphone_messages.sql` before enabling speech. Ordinary typed send/history/replay remain compatible with the previous schema, so deploying source while voice is disabled does not break text chat. Additive columns default all existing messages to text; existing patient RLS/role grants remain unchanged. A unique receipt-ID index blocks reuse across request keys/conversations. No clinical history or raw audio is deleted. No hosted migration or application deployment is performed by this task.

The installed Supabase CLI2.120 wrapper does not support Android and its current front-end executable needs a Linux loader. The official standalone Go CLI2.75 was downloaded into ignored `.local/speech-tools/legacy-cli` and used with its inspected `migration new` command to generate the migration filename. Native Termux PostgreSQL is used only for disposable tests; `tests/helpers/postgres.ts` imports embedded-postgres lazily on supported platforms and uses the native helper on Android.

Owner refinement: speech is now enabled for all authenticated accounts. No `SPEECH_ENABLED`, `SPEECH_ALLOWED_ACCOUNT_IDS` or application speech-quota settings are needed; old settings are ignored. Owner reports manually running the migration. This task does not rerun it.

The existing server-only `GEMINI_API_KEY` and a valid64-hex-character `AUTH_FLOW_COOKIE_KEY` are required. Local inspection found the latter missing/invalid; a cryptographically random32-byte key was generated and saved only in ignored local environment configuration, without printing it. Existing valid keys are preserved. Restart the local server to load this key. A separately hosted deployment needs those server secrets in its own environment and the updated source deployed; an ignored local env file does not configure Vercel.

Model usage stays economical through the existing Flash-Lite chat/extraction model, dedicated Gemini3.5 STT and3.8 Flash-Lite TTS, one speech provider attempt per explicit action, no recognition call for silence and memory-only audio reuse for replay. Google still enforces its project-level free-tier limits. There is no added application speech request budget. Transcription review receipts expire after10 minutes; use “Use as typed message” to retain reviewed text and send silently if needed.

The GET status verifies the current session/server keys and returns enabled status for every authenticated account. The POST validates the exact app Origin, JSON type, bounded streamed request size and strict action schema; services authorize again. Audio body size fits Vercel's normal request ceiling. Deployment needs HTTPS, WebAudio/AudioWorklet support and microphone permission. No WebSocket or persistent audio server is required.

## Data and provider release gates

Free-tier experimentation is synthetic-only. Google's standard Gemini Developer API terms restrict medical advice/clinical use and sensitive information on unpaid services. Verify the appropriate provider service/agreement and data handling for real health-data use; payment alone does not establish medical-use permission. `store:false` opts out of retrievable Interactions state, not every provider retention purpose. Do not label this work clinical or privacy certification.

Naturalness, pronunciation and audible fidelity need a human listening check. Review `.local/speech-audition/sample-{1,2,3}.wav` for everyday conversation, medication/numbers and urgent guidance; listen for added/omitted words, inappropriate cheerful delivery and inaccurate medicine pronunciation. Sample1 STT roundtrip returned the original synthetic sentence exactly apart from harmless punctuation. No listening approval is assumed or required to begin owner-authorized device testing. Android Chrome and iOS Safari real-device permission, interruption, silence/noise, backgrounding and autoplay checks remain explicit until run; jsdom is not browser/audio-device proof.

## Verification

- Baseline chat UI8/8 passed.
- First focused UI/gateway/recording suite10/10 passed; existing chat/gateway combined checks14/14 passed earlier in implementation.
- Initial native speech/chat integration8 passed,1 optional live chat test skipped. Final consolidated seven-file suite passed33/33 plus1 optional live-chat skip, including extraction, typed pre-migration compatibility and HTTP/ownership checks.
- Live synthetic speech audition: one test passed,3 TTS clips plus1 STT call, with no hosted patient data. The scripts are opt-in (`MHISTREE_LIVE_SPEECH_TEST=1 pnpm exec vitest run tests/speech-live.test.ts`). Do not repeatedly run this against the owner's free quota.
- Final full lint, noEmit TypeScript, source production build with the documented isolated Sharp WebAssembly fallback, client-secret scan and whitespace check passed; exact commands/earlier runs are in WORKFLOW. No real patient testing, remote schema write, account mutation or deployment.

## Official references inspected

[Transcription](https://ai.google.dev/gemini-api/docs/transcribe), [TTS/structured style metadata](https://ai.google.dev/gemini-api/docs/speech-generation), [Interactions REST and inline audio/store flag](https://ai.google.dev/api/interactions-api), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [project quotas](https://ai.google.dev/gemini-api/docs/rate-limits), [terms](https://ai.google.dev/gemini-api/terms). No native-audio Live model is added.

Availability refinement verification: six-file speech/chat regression29/29 passed; targeted ESLint, noEmit TypeScript, production build with local Android Sharp WASM fallback, client-secret scan and whitespace checks passed. Native tests verify speech for a new authenticated account without speech settings, ignore old flag/allowlist/zero quota values, create no speech rate-limit counters and still deny invalid sessions. No additional live-provider calls or hosted migration/deployment were performed.
