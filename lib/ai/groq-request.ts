import "server-only";
import { DomainError } from "@/lib/errors";
import { aiDebug } from "./debug";

/** One attempt per action. A timeout may already have consumed quota: never replay it. */
export async function groqRequest(
  key: string,
  endpoint: "chat/completions" | "audio/transcriptions" | "audio/speech",
  body: string | FormData,
  signal?: AbortSignal,
) {
  const deadline = AbortSignal.timeout(45000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    combined.throwIfAborted();
    const response = await fetch(`https://api.groq.com/openai/v1/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(typeof body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body,
      signal: combined,
      cache: "no-store",
      redirect: "error",
    });
    aiDebug("provider.http", { upstreamStatus: response.status, attempt: 1 });
    if (!response.ok) {
      if (response.status === 429) {
        let reason = "rate-limit-unspecified";
        try {
          const payload = (await groqJson(response)) as {
            error?: { message?: unknown };
          };
          const message =
            typeof payload?.error?.message === "string"
              ? payload.error.message
              : "";
          for (const [pattern, label] of [
            [/tokens per day|\bTPD\b/i, "tokens-per-day"],
            [/tokens per minute|\bTPM\b/i, "tokens-per-minute"],
            [/requests per day|\bRPD\b/i, "requests-per-day"],
            [/requests per minute|\bRPM\b/i, "requests-per-minute"],
          ] as const)
            if (pattern.test(message)) {
              reason = label;
              break;
            }
        } catch {
          /* No raw error text, headers or account identifiers in diagnostics. */
        }
        const retrySeconds = Number(response.headers.get("retry-after"));
        aiDebug("provider.http.failed", {
          upstreamStatus: 429,
          quotaFailure: true,
          reason,
          ...(Number.isFinite(retrySeconds) && retrySeconds > 0
            ? { retryMs: retrySeconds * 1000 }
            : {}),
        });
      }
      if (response.status === 400) {
        let requiresTerms = false;
        try {
          const payload = (await groqJson(response)) as {
            error?: { code?: unknown };
          };
          requiresTerms = payload?.error?.code === "model_terms_required";
        } catch {
          /* Preserve the original HTTP failure; never expose upstream text. */
        }
        if (requiresTerms) {
          aiDebug("provider.http.failed", {
            upstreamStatus: 400,
            providerStatus: "model_terms_required",
          });
          throw new DomainError("CONFIGURATION_REQUIRED");
        }
      }
      await response.body?.cancel();
      throw new DomainError(
        response.status === 429 ? "RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
      );
    }
    return response;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("PROVIDER_UNAVAILABLE");
  }
}

/** Bound streamed responses too; Content-Length alone is not trusted. */
export async function groqBytes(response: Response, maximum: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new DomainError("PROVIDER_UNAVAILABLE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new DomainError("PROVIDER_UNAVAILABLE");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch {
    await reader.cancel().catch(() => {});
    throw new DomainError("PROVIDER_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
}

export async function groqJson(response: Response) {
  try {
    return JSON.parse(
      (await groqBytes(response, 256 * 1024)).toString("utf8"),
    ) as unknown;
  } catch {
    throw new DomainError("PROVIDER_UNAVAILABLE");
  }
}
