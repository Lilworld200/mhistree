import "server-only";
import { setTimeout as delay } from "node:timers/promises";
import { DomainError } from "@/lib/errors";
import { aiDebug } from "./debug";

/** Retries share one deadline so the 60-second generation lease cannot expire. */
export async function requestGemini(
  url: string,
  init: RequestInit,
  model: string,
  signal?: AbortSignal,
) {
  const deadline = AbortSignal.timeout(45000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response: Response | undefined;
    aiDebug("provider.attempt", { model, attempt });
    try {
      combined.throwIfAborted();
      response = await fetch(url, { ...init, signal: combined });
      if (response.ok) {
        aiDebug("provider.http", {
          model,
          attempt,
          upstreamStatus: response.status,
        });
        return response;
      }
    } catch {
      aiDebug("provider.network.failed", {
        model,
        attempt,
        reason: combined.aborted ? "aborted-or-timeout" : "network-failure",
      });
      console.warn("[AI gateway]", {
        model,
        attempt,
        reason: combined.aborted ? "aborted-or-timeout" : "network-failure",
      });
      if (combined.aborted || attempt === 3)
        throw new DomainError("PROVIDER_UNAVAILABLE");
    }
    if (response)
      console.warn("[AI gateway]", {
        model,
        attempt,
        upstreamStatus: response.status,
      });
    if (response) {
      // Never log upstream messages/details: they may echo prompts or credentials.
      let providerStatus: string | undefined;
      let quotaFailure = false;
      try {
        const data = await response.clone().json();
        const status = data?.error?.status;
        if (
          [
            "RESOURCE_EXHAUSTED",
            "UNAVAILABLE",
            "PERMISSION_DENIED",
            "INVALID_ARGUMENT",
            "INTERNAL",
            "NOT_FOUND",
            "UNAUTHENTICATED",
            "DEADLINE_EXCEEDED",
          ].includes(status)
        )
          providerStatus = status;
        quotaFailure =
          Array.isArray(data?.error?.details) &&
          data.error.details.some(
            (d: Record<string, unknown>) =>
              d?.["@type"] === "type.googleapis.com/google.rpc.QuotaFailure",
          );
      } catch {
        /* HTTP status remains useful even for non-JSON errors. */
      }
      aiDebug("provider.http.failed", {
        model,
        attempt,
        upstreamStatus: response.status,
        providerStatus,
        quotaFailure,
      });
    }
    const retryable =
      !response || [408, 429, 500, 502, 503, 504].includes(response.status);
    const code =
      response?.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE";
    if (!retryable || attempt === 3) {
      await response?.body?.cancel();
      throw new DomainError(code);
    }
    const header = response?.headers.get("retry-after");
    const retryAfter = header
      ? /^\d+(\.\d+)?$/.test(header)
        ? Number(header) * 1000
        : Date.parse(header) - Date.now()
      : 0;
    const wait = Math.max(
      1000 * 2 ** (attempt - 1) + Math.random() * 250,
      Number.isFinite(retryAfter) ? retryAfter : 0,
    );
    await response?.body?.cancel();
    // Long quota waits need user retry rather than holding a request/lease open.
    if (wait > 10000) throw new DomainError(code);
    aiDebug("provider.retry.wait", {
      model,
      attempt,
      retryMs: Math.round(wait),
    });
    try {
      await delay(wait, undefined, { signal: combined });
    } catch {
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
  }
  throw new DomainError("PROVIDER_UNAVAILABLE");
}
