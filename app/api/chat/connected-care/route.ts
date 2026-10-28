import { NextRequest } from "next/server";
import { DomainError } from "@/lib/errors";
import { failure, mutationGuard } from "@/lib/http";
/** Combined AI/care sessions are retired; refresh and use the dedicated inbox. */
export async function POST(request: NextRequest) {
  try {
    mutationGuard(request);
    throw new DomainError("VERSION_CONFLICT");
  } catch (e) {
    return failure(e);
  }
}
