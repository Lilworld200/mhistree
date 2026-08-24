import { NextResponse } from "next/server";

/**
 * POST /api/ai/chat — patient & clinician conversation endpoint.
 *
 * Intended flow (idea_scaffold.md §4–§9):
 *   1. Authenticate via Supabase Auth session (lib/supabase/server.ts).
 *   2. Resolve caller role → patient chat vs clinician assistant config
 *      (aiConfig.patientConversation / aiConfig.clinicianAssistant).
 *   3. For clinicians: verify an ACTIVE lease covers this patient and that
 *      the request never touches Personal Context (context router).
 *   4. Build context via Memory Service (durable memory inheritance for new
 *      sessions) + Clinical Ledger facts — provenance-aware.
 *   5. Call the LLM Gateway (`ai.stream`) — never a vendor SDK directly.
 *   6. Stream ChatChunks back as SSE; log AI request metadata
 *      (provider, model, latency, tokens, request id).
 *
 * Replace the demo reply engine in features/chat/data/reply-rules.ts and
 * features/clinician/store.ts canned answers with calls to this route.
 */
export async function POST() {
  return NextResponse.json(
    { error: "AI gateway not implemented — see lib/ai/gateway.ts scaffold" },
    { status: 501 },
  );
}
