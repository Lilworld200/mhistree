import { NextRequest } from "next/server";
import { database } from "@/lib/db/client";
import {
  reviewQueue,
  reviewProfessional,
  credentialDownload,
} from "@/features/practitioner/profile";
import {
  mutationGuard,
  jsonBody,
  sessionFrom,
  success,
  failure,
} from "@/lib/http";
export async function GET(r: NextRequest) {
  try {
    const id = r.nextUrl.searchParams.get("credential");
    if (id) {
      const bytes = await credentialDownload(database(), sessionFrom(r), id);
      return new Response(bytes as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=credential.pdf",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
        },
      });
    }
    return success(await reviewQueue(database(), sessionFrom(r)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    mutationGuard(r);
    return success(
      await reviewProfessional(database(), sessionFrom(r), await jsonBody(r)),
    );
  } catch (e) {
    return failure(e);
  }
}
