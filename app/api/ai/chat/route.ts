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
import { NextResponse, after } from "next/server";
import { z } from "zod";
import { ai } from "@/lib/ai/gateway";
import { aiConfig } from "@/lib/ai/config";
import {
  MedicalExtractionSchema,
  type MedicalExtraction,
} from "@/lib/ai/schemas/extraction";
import { buildPatientSystemPrompt, type SessionRecapContext } from "@/lib/ai/prompts/patient";
import {
  buildExtractionPrompt,
  type ExtractionTurn,
} from "@/lib/ai/prompts/extraction";
import { searchMedicalChunks } from "@/lib/ai/rag";
import { persistExtractedMedications } from "@/lib/server/medication-persistence";
import { syncDerivedHealth } from "@/lib/server/profile-sync";
import {
  maybeSummarizeSession,
  maybeRollUserSummary,
} from "@/lib/server/summarization";
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

// Extracted facts must be at least this specified (clarity_score 0–1) before
// they are persisted. Below the threshold the extractor reports what is
// missing and the chat companion keeps asking — see prompts/extraction.ts.
const EXTRACT_STORE_THRESHOLD = 0.5;

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
  let userSummary: string | null = null;
  let sessionSummaries: SessionRecapContext[] = [];

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
      const currentSessionId =
        typeof body.sessionId === "string" && body.sessionId.length > 0
          ? body.sessionId
          : null;

      // 3. Fetch patient Longitudinal EHR context from Supabase
      const [profileRes, memoriesRes, vitalsRes, medsRes, userSummaryRes, recapRes] =
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
          // Latest rolling longitudinal digest (replaces raw memory dump).
          supabase
            .from("user_summaries")
            .select("summary")
            .eq("user_id", pid)
            .eq("scope", "user")
            .order("created_at", { ascending: false })
            .limit(1),
          // Latest recaps of OTHER recent sessions (current one excluded —
          // its full transcript is already present in the request).
          supabase
            .from("user_summaries")
            .select("summary, session_id, created_at, chat_sessions(title)")
            .eq("user_id", pid)
            .eq("scope", "chat_session")
            .neq("session_id", currentSessionId ?? "00000000-0000-0000-0000-000000000000")
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      profile = profileRes.data || null;
      memories = (memoriesRes.data as DBHealthMemory[]) || [];
      recentVitals = (vitalsRes.data as DBVital[]) || [];
      activeMedications = (medsRes.data as DBMedication[]) || [];

      const latestSummary = (userSummaryRes.data as { summary: string }[] | null)?.[0];
      userSummary = latestSummary?.summary ?? null;
      sessionSummaries = (
        (recapRes.data ?? []) as {
          summary: string;
          created_at: string;
          chat_sessions: { title: string } | { title: string }[] | null;
        }[]
      ).map((r) => {
        const s = r.chat_sessions;
        const title = Array.isArray(s) ? s[0]?.title : s?.title;
        return {
          title: title || "Session",
          when: new Date(r.created_at).toLocaleDateString(),
          summary: r.summary,
        };
      });

      // 4. Perform RAG vector search if query text exists.
      //    Non-fatal by design: a retrieval/embedding failure must never
      //    break the conversation — it only means no document context.
      if (lastUserMessage) {
        try {
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
        } catch (ragErr) {
          console.error("[Chat] RAG search skipped:", ragErr);
        }
      }
    } else {
      console.error(
        "[Chat] Authenticated user has no public.users row (auth id:",
        user.id,
        ") — run supabase/migrations/002_resilient_signup_trigger.sql",
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
    userSummary,
    sessionSummaries,
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
  //    Wrapped in after() so the work keeps running to completion AFTER this
  //    response (and its SSE stream) closes — a bare fire-and-forget promise
  //    can be frozen mid-flight on serverless runtimes and silently dropped.
  if (db && patientId && lastUserMessage) {
    const pId = patientId;
    const userMsg = lastUserMessage.content;

    after(async () => {
      await Promise.allSettled([
        logAuditEvent({
          actorId: pId,
          actorRole: "patient",
          action: "chat_message",
          patientId: pId,
          metadata: { messageLength: userMsg.length },
        }),
        (async () => {
          try {
            // Extract over a short conversation window so multi-turn arcs
            // ("vague mention" → probe → "it's Coartem") reach full clarity.
            const recentWindow: ExtractionTurn[] = sanitizedMessages
              .slice(-6)
              .map((m) => ({ role: m.role, content: m.content }));
            const prompt = buildExtractionPrompt(
              recentWindow,
              // On-file meds let the extractor resolve indirect references
              // like "my malaria medicine" / "the antibiotics" even when the
              // actual name was mentioned in a much older session.
              activeMedications.map(
                (m) =>
                  `${m.drug_name}${
                    m.dosage && m.dosage.toLowerCase() !== "unknown"
                      ? ` (${m.dosage})`
                      : ""
                  }`,
              ),
            );

            console.info(
              "[Extraction] start — provider=%s model=%s window=%d turns",
              aiConfig.extraction.provider,
              aiConfig.extraction.model,
              recentWindow.length,
            );

            const runExtraction = () =>
              ai.structured("extraction", {
                prompt,
                schema: MedicalExtractionSchema,
                validate: (data: unknown) => MedicalExtractionSchema.parse(data),
              });

            let extraction: MedicalExtraction;
            try {
              extraction = await runExtraction();
            } catch (firstErr) {
              console.error(
                "[Extraction] attempt 1 failed — retrying once:",
                firstErr,
              );
              await new Promise((resolve) => setTimeout(resolve, 1500));
              extraction = await runExtraction();
            }

            // Decision trace — what the extractor produced and what the gates
            // below will do with it. Logged from the SAME call, zero extra
            // token cost.
            console.info(
              "[Extraction] parsed — memories=%d medications=%d vitals=%d",
              extraction.memories.length,
              extraction.medications.length,
              extraction.vitals.length,
            );
            console.info(
              "[Extraction] extractor output:\n%s",
              JSON.stringify(
                {
                  memories: extraction.memories.map((m) => ({
                    category: m.fact_category,
                    summary: m.fact_summary,
                    clarity: m.clarity_score,
                    missing: m.missing_details,
                  })),
                  medications: extraction.medications.map((m) => ({
                    name: m.drug_name,
                    clarity: m.clarity_score,
                    llm_trust: m.trust_score,
                    inferred_by: m.inferred_by,
                    dosage: m.dosage,
                    frequency: m.frequency,
                    missing: m.missing_details,
                  })),
                  vitals: extraction.vitals.length,
                },
                null,
                2,
              ),
            );

            const isStorable = (score?: number) =>
              (score ?? 0) >= EXTRACT_STORE_THRESHOLD;

            // ── Health memories (clarity-gated, deduped by summary) ──
            const storableMemories = extraction.memories.filter((m) =>
              isStorable(m.clarity_score),
            );
            const belowThreshold = extraction.memories.filter(
              (m) => !isStorable(m.clarity_score),
            );
            if (belowThreshold.length > 0) {
              console.info(
                "[Extraction] holding %d fact(s) below %s clarity:",
                belowThreshold.length,
                EXTRACT_STORE_THRESHOLD,
                JSON.stringify(
                  belowThreshold.map((m) => ({
                    summary: m.fact_summary,
                    score: m.clarity_score,
                    missing: m.missing_details,
                  })),
                ),
              );
            }

            if (storableMemories.length > 0) {
              const { data: existing } = await db
                .from("health_memories")
                .select("fact_summary")
                .eq("patient_id", pId)
                .order("created_at", { ascending: false })
                .limit(200);
              const seen = new Set(
                (existing ?? []).map((r) => r.fact_summary.trim().toLowerCase()),
              );
              const newMemories = storableMemories.filter(
                (m) => !seen.has(m.fact_summary.trim().toLowerCase()),
              );

              if (newMemories.length > 0) {
                const memoryRows = newMemories.map((mem) => ({
                  patient_id: pId,
                  contributor_role: "ai_extractor" as const,
                  fact_category: mem.fact_category,
                  fact_summary: mem.fact_summary,
                  clinical_payload: {
                    ...(mem.clinical_payload ?? {}),
                    severity: mem.severity,
                    clarity_score: mem.clarity_score,
                    missing_details: mem.missing_details,
                    source_messages: recentWindow
                      .filter((t) => t.role === "user")
                      .map((t) => t.content),
                    extracted_at: new Date().toISOString(),
                  },
                  snomed_code: mem.snomed_code || null,
                  icd10_code: mem.icd10_code || null,
                  confidence_score: mem.confidence_score,
                  is_verified: false,
                }));
                const { error } = await db
                  .from("health_memories")
                  .insert(memoryRows);
                if (error) {
                  console.error("[Extraction] memory insert failed:", error);
                } else {
                  console.info(
                    "[Extraction] stored %d health memor(y/ies)",
                    newMemories.length,
                  );
                }
              }
            }

            // ── Medications (clarity-gated shared persistence: dynamic trust
            //    scoring, ±10 correction-tolerant upsert, dual health_memories
            //    write) — see lib/server/medication-persistence.ts ──
            const storableMeds = extraction.medications.filter((m) =>
              isStorable(m.clarity_score),
            );
            const heldMeds = extraction.medications.filter(
              (m) => !isStorable(m.clarity_score),
            );
            if (heldMeds.length > 0) {
              console.info(
                "[Extraction] holding %d med(s) below %s clarity (timeline-only via memories, NOT saved to medications table): %s",
                heldMeds.length,
                EXTRACT_STORE_THRESHOLD,
                JSON.stringify(
                  heldMeds.map((m) => ({
                    name: m.drug_name,
                    score: m.clarity_score,
                    missing: m.missing_details,
                  })),
                ),
              );
            }
            await persistExtractedMedications(db, pId, storableMeds, recentWindow);

            // ── Vitals (numeric facts are self-contained; no gate needed) ──
            const reportedVitals = extraction.vitals.filter(
              (v) => v.numeric_value != null || (v.text_value ?? "") !== "",
            );
            if (reportedVitals.length > 0) {
              const vitalRows = reportedVitals.map((v) => ({
                patient_id: pId,
                vital_type: v.vital_type,
                numeric_value: v.numeric_value ?? null,
                text_value: v.text_value ?? null,
                unit: v.unit || null,
                source: "patient_reported",
                recorded_at: new Date().toISOString(),
              }));
              const { error } = await db.from("health_vitals").insert(vitalRows);
              if (error) {
                console.error("[Extraction] vitals insert failed:", error);
              }
            }

            console.info("[Extraction] pipeline complete");

            // ── Derived health-profile sync (CONFIRMED/DETERMINED tiers) ──
            await syncDerivedHealth(db, pId);

            // ── Two-tier rolling summaries (threshold-gated, append-only) ──
            if (activeSessionId) {
              await maybeSummarizeSession(db, pId, activeSessionId);
            }
            await maybeRollUserSummary(db, pId);
          } catch (err) {
            console.error("[Extraction] pipeline failed:", err);
          }
        })(),
      ]).catch(() => {});
    });
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
