# Grounded recall presentation — 2026-10-20

Owner corrected ordinary patient chat: say “I recall you mentioned…” with the relevant date/experience rather than “I see a note,” and do not paste timeline reference IDs. Their belly-pain recall example is a presentation requirement, not an instruction to invent October17/severity for other patients.

Read AGENTS/WORKFLOW, AI-chat README/feature map, clinical-records contract, owning prompt/server/search tests, playbook T11/T16 and maintenance/acceptance appendices. Existing sources/authorization/time/version rules retained. No database/schema/configuration/UI changes, hosted access or historical message rewriting.

Cause: patient-prompt.ts explicitly required bracketed event-ID citations, a follow-up example repeated that requirement, and server.ts appended “cite event IDs if used” to the evidence wrapper. These instructions were added during the preceding search task. Owner correction supersedes them.

Changed all three instructions. Ordinary replies now treat retrieved history as grounded conversational recall, avoid note/entry/database narration and keep source/event IDs, UUID citations and record URLs internal. Prior assistant messages with bad presentation must not be imitated. Added a supported-evidence-only recall example; absent history must still be acknowledged honestly. Formal assessment/practitioner source displays remain separate. Retrieval/source lineage, persistence and publication authorization checks are unchanged.

Updated integration/timeline-search assertions: internal prompts retain evidence IDs, visible reply need not contain them; opt-in real Gemini cases reject UUIDs/note-reading language and include the owner's exact recall question with synthetic October17 serious stomach pain. Other cases retain belly-improvement and run/leg-pain contextual questions without assumed causation. No clinical approval claimed.

Deterministic native PostgreSQL/chat/send-flow run:19 passed/two opt-in live skipped. Full lint, TypeScript and whitespace checks passed. First real Gemini run failed before generating any output with the existing45-second PROVIDER_UNAVAILABLE timeout; no failed wording assertion or fabricated success. One retry is recorded in WORKFLOW. No production build/browser check needed for prompt/context-wrapper text plus tests. Synthetic clusters cleaned up by test finally hooks; no real patient evidence sent to Gemini.

Files: patient-prompt.ts, server.ts context-wrapper text, tests/integration/timeline-search.test.ts. Owner decision retained in AGENTS7.2; README/map/contract and WORKFLOW updated. Earlier visible-citation requirements/evaluation results remain historical and are superseded for ordinary chat.

Retry outcome: the second live attempt also reached authorized retrieval but timed out before any model reply at45 seconds with PROVIDER_UNAVAILABLE. No new wording assertion could run in either attempt; no claim of live wording verification. Each run's seven deterministic search checks passed. Stopped further provider retries; model/provider availability is separate from this presentation fix.
