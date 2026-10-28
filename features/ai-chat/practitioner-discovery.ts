import "server-only";
import type { Pool } from "pg";
import { getConnectedPractitioners } from "@/features/access/patient-controls";
import { DomainError } from "@/lib/errors";
import { aiDebug, aiDebugError } from "@/lib/ai/debug";

/** Optional identity discovery must never roll back clinical retrieval or invent
 * an empty recipient list when discovery failed. Session/access errors propagate. */
export async function practitionerDiscovery(pool: Pool, session: string) {
  try {
    const result = await getConnectedPractitioners(pool, session);
    aiDebug("practitioner.discovery", {
      state: result.status,
      itemCount: result.connectedPractitioners.length,
      bounded: result.bounded,
    });
    return result;
  } catch (error) {
    if (
      error instanceof DomainError &&
      [
        "AUTH_REQUIRED",
        "SESSION_RETIRED",
        "ACCESS_DENIED",
        "ACCESS_REVOKED",
      ].includes(error.code)
    )
      throw error;
    aiDebugError("practitioner.discovery.failed", error);
    return { status: "unavailable" as const };
  }
}
