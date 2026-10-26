import { z } from "zod";
import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
import {
  speechInput,
  maxRecordingBytes,
} from "@/features/ai-chat/speech/schema";
import {
  speechStatus,
  speechPlaybackAccess,
  transcribeRecording,
  synthesizeReply,
} from "@/features/ai-chat/speech/server";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    const messageId = request.nextUrl.searchParams.get("messageId");
    if (messageId) {
      await speechPlaybackAccess(
        database(),
        sessionFrom(request),
        z.uuid().parse(messageId),
      );
      return success({ enabled: true });
    }
    return success(await speechStatus(database(), sessionFrom(request)));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    const pool = database(),
      session = sessionFrom(request);
    // Authenticate before accepting a bounded audio upload; no public speech proxy.
    await speechStatus(pool, session);
    const input = speechInput.parse(
      await jsonBody(request, Math.ceil(maxRecordingBytes / 3) * 4 + 1024),
    );
    if (input.action === "transcribe")
      return success(
        await transcribeRecording(
          pool,
          session,
          new Uint8Array(Buffer.from(input.base64, "base64")),
          request.signal,
        ),
      );
    const audio = await synthesizeReply(
      pool,
      session,
      input.messageId,
      request.signal,
    );
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
