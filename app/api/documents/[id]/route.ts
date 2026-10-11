import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import { sessionFrom, failure } from "@/lib/http";
import { readPrivateOriginal } from "@/features/access/private-files";
import { LocalPrivateStore } from "@/lib/storage/local";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const bytes = await readPrivateOriginal(
      database(),
      sessionFrom(request),
      { kind: "patient" },
      id,
      new LocalPrivateStore(),
    );
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="mhistree-original"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
