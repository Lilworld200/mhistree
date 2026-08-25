/**
 * POST /api/ai/chat — Live streaming chat endpoint via OpenRouter AI Gateway.
 *
 * Streamed via Server-Sent Events (SSE).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { ai } from "@/lib/ai/gateway";
import { buildPatientSystemPrompt } from "@/lib/ai/prompts/patient";

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

function getBaselineContext() {
  return buildPatientSystemPrompt({
    name: "Nati",
    profile: null,
    memories: [],
    recentVitals: [],
    activeMedications: [],
  });
}

export async function POST(request: Request) {
  let body: z.infer<typeof ChatRequestSchema>;
  try {
    body = ChatRequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 },
    );
  }

  const systemPrompt = getBaselineContext();
  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...body.messages,
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chunks = ai.stream("patientConversation", { messages });

        for await (const chunk of chunks) {
          if (chunk.delta) {
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
      }
    },
  });

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
