/**
 * POST /api/ai/chat — Patient & Clinician Streaming AI Conversation Endpoint.
 *
 * Full Production Data Flow:
 *   1. Input sanitization (DOMPurify via lib/security/sanitize.ts)
 *   2. Identity resolution via the Supabase auth session cookie
 *      - Guests: pure streaming mode — ZERO Supabase reads/writes
 *      - Members: full longitudinal EHR context + persistence
 *   3. Longitudinal EHR context fetch (profiles, memories, vitals, medications)
 *   4. Multimodal RAG vector search over medical documents via pgvector
 *   5. System prompt injection (lib/ai/prompts/patient.ts)
 *   6. OpenRouter streaming text generation (SSE)
 *   7. Background medical entity extraction & health memory persistence
 *   8. Audit logging
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { ai } from "@/lib/ai/gateway";
import { MedicalExtractionSchema } from "@/lib/ai/schemas/extraction";
import { buildPatientSystemPrompt } from "@/lib/ai/prompts/patient";
import { searchMedicalChunks } from "@/lib/ai/rag";
import { logAuditEvent } from "@/lib/security/audit";
import { sanitizeInput } from "@/lib/security/sanitize";
import {
  createAdminSupabaseClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";
import type {
  DBHealthMemory,
  DBVital,
  DBMedication,
  DBHealthProfile,
} from "@/lib/supabase/types";

const ChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1).max(16_000),
      }),
    )
    .min(1),
  sessionId: z.string().optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof ChatRequestSchema>;
  try {
    const json = await request.json();
    body = ChatRequestSchema.parse(json);
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload format" },
      { status: 400 },
    );
  }

  // 1. Sanitize latest user message
  const sanitizedMessages = body.messages.map((m) => ({
    role: m.role,
    content: sanitizeInput(m.content),
  }));

  const lastUserMessage = sanitizedMessages
    .slice()
    .reverse()
    .find((m) => m.role === "user");

  // 2. Resolve identity from the auth session cookie.
  //    Guests (no session) get pure streaming — the database is never touched.
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  // Service-role client is only ever created for authenticated traffic.
  const supabase = user ? createAdminSupabaseClient() : null;

  let patientId: string | null = null;
  let patientName = "Patient";
  let profile: DBHealthProfile | null = null;
  let memories: DBHealthMemory[] = [];
  let recentVitals: DBVital[] = [];
  let activeMedications: DBMedication[] = [];
  let ragChunksText = "";

  if (user && supabase) {
    const { data: userRow } = await supabase
      .from("users")
      .select("id, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    if (userRow) {
      const pid = userRow.id;
      patientId = pid;
      patientName =
        `${userRow.first_name} ${userRow.last_name}`.trim() || "Patient";

      // 3. Fetch patient Longitudinal EHR context from Supabase
      const [profileRes, memoriesRes, vitalsRes, medsRes] =
        await Promise.all([
          supabase
            .from("health_profiles")
            .select("*")
            .eq("user_id", pid)
            .maybeSingle(),
          supabase
            .from("health_memories")
            .select("*")
            .eq("patient_id", pid)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("health_vitals")
            .select("*")
            .eq("patient_id", pid)
            .order("recorded_at", { ascending: false })
            .limit(10),
          supabase
            .from("medications")
            .select("*")
            .eq("patient_id", pid)
            .eq("status", "active"),
        ]);

      profile = profileRes.data || null;
      memories = (memoriesRes.data as DBHealthMemory[]) || [];
      recentVitals = (vitalsRes.data as DBVital[]) || [];
      activeMedications = (medsRes.data as DBMedication[]) || [];

      // 4. Perform RAG vector search if query text exists
      if (lastUserMessage) {
        const ragResults = await searchMedicalChunks(
          pid,
          lastUserMessage.content,
          4,
        );
        if (ragResults.length > 0) {
          ragChunksText =
            `\nRELEVANT MEDICAL DOCUMENTS (RAG RETRIEVAL):\n` +
            ragResults
              .map(
                (r, i) =>
                  `[Doc ${i + 1}: ${r.document_name}] (Relevance: ${(r.similarity * 100).toFixed(0)}%)\n${r.chunk_text}`,
              )
              .join("\n\n");
        }
      }
    } else {
      console.error(
        "[Chat] Authenticated user has no public.users row (auth id:",
        user.id,
        ") — run supabase/migrations/002_auth_user_provisioning.sql",
      );
    }
  }

  // 5. Build system prompt with injected context (defaults for guests)
  let systemPrompt = buildPatientSystemPrompt({
    name: patientName,
    profile,
    memories,
    recentVitals,
    activeMedications,
  });

  if (ragChunksText) {
    systemPrompt += `\n${ragChunksText}`;
  }

  const promptMessages = [
    { role: "system" as const, content: systemPrompt },
    ...sanitizedMessages,
  ];

  // 6. Stream response via OpenRouter Gateway (SSE).
  //    Persistence below ONLY happens for authenticated, provisioned users.
  const encoder = new TextEncoder();
  let fullAiText = "";
  const db = supabase;
  const activeSessionId = patientId ? (body.sessionId ?? null) : null;

  if (db && activeSessionId && lastUserMessage) {
    const sessionTitle =
      lastUserMessage.content.slice(0, 30) +
      (lastUserMessage.content.length > 30 ? "…" : "");

    // Upsert session
    const { error: sessErr } = await db.from("chat_sessions").upsert(
      {
        id: activeSessionId,
        patient_id: patientId!,
        title: sessionTitle,
        session_group: "Today",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (sessErr) {
      console.error("[Chat Session Upsert Error]:", sessErr);
    }

    // Save user message
    const { error: userMsgErr } = await db.from("chat_messages").insert({
      session_id: activeSessionId,
      role: "user",
      content: lastUserMessage.content,
      tokens_used: 0,
      attachments: [],
    });
    if (userMsgErr) {
      console.error("[Chat User Message Insert Error]:", userMsgErr);
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chunks = ai.stream("patientConversation", {
          messages: promptMessages,
        });

        for await (const chunk of chunks) {
          if (chunk.delta) {
            fullAiText += chunk.delta;
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ delta: chunk.delta })}\n\n`,
              ),
            );
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : "AI streaming error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`),
        );
      } finally {
        controller.close();

        // Persist completed AI response to Supabase (members only)
        if (db && activeSessionId && fullAiText.trim()) {
          try {
            await db.from("chat_messages").insert({
              session_id: activeSessionId,
              role: "assistant",
              content: fullAiText,
              tokens_used: 0,
              attachments: [],
            });

            await db
              .from("chat_sessions")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", activeSessionId);
          } catch (e) {
            console.error("[Chat Stream Save Error]:", e);
          }
        }
      }
    },
  });

  // 7. Asynchronous Audit Logging & Continuous Health Memory Extraction.
  //    Runs exclusively for authenticated users with a provisioned users row.
  if (db && patientId && lastUserMessage) {
    const pId = patientId;
    const userMsg = lastUserMessage.content;

    Promise.allSettled([
      logAuditEvent({
        actorId: pId,
        actorRole: "patient",
        action: "chat_message",
        patientId: pId,
        metadata: { messageLength: userMsg.length },
      }),
      (async () => {
        try {
          const extraction = await ai.structured("extraction", {
            prompt: `Extract any new health facts, symptoms, vitals, or medications mentioned by the patient in this message:\n\n"${userMsg}"`,
            schema: MedicalExtractionSchema,
            validate: (data: unknown) => MedicalExtractionSchema.parse(data),
          });

          if (extraction.memories && extraction.memories.length > 0) {
            const memoryRows = extraction.memories.map((mem) => ({
              patient_id: pId,
              contributor_role: "ai_extractor" as const,
              fact_category: mem.fact_category,
              fact_summary: mem.fact_summary,
              clinical_payload: {
                ...(mem.clinical_payload ?? {}),
                original_message: userMsg,
                extracted_at: new Date().toISOString(),
              },
              snomed_code: mem.snomed_code || null,
              icd10_code: mem.icd10_code || null,
              confidence_score: mem.confidence_score,
              is_verified: false,
            }));
            await db.from("health_memories").insert(memoryRows);
          }
        } catch {
          // Non-blocking error handling for background task
        }
      })(),
    ]).catch(() => {});
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  const health = await ai.health("patientConversation");
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
