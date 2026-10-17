import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";

type DebugContext = {
  traceId: string;
  startedAt: number;
  operation: string;
  messageRef?: string;
  jobRef?: string;
};
const context = new AsyncLocalStorage<DebugContext>();
const enabled = () =>
  process.env.AI_DEBUG === "1" ||
  (process.env.NODE_ENV !== "production" && process.env.AI_DEBUG !== "0");

// Runtime allowlists, not just TS types: never serialize arbitrary errors, source
// text, prompts, output, headers, credentials, SQL detail or provider reasoning.
const numbers = new Set([
  "durationMs",
  "attempt",
  "upstreamStatus",
  "retryMs",
  "messageCount",
  "inputCharacters",
  "outputCharacters",
  "contextCharacters",
  "evidenceCount",
  "priorReportCount",
  "itemIndex",
  "itemCount",
  "acceptedItems",
  "savedItems",
  "replayedItems",
  "issueCount",
  "clarificationCount",
  "promptTokenCount",
  "candidatesTokenCount",
  "totalTokenCount",
  "cachedContentTokenCount",
  "thoughtsTokenCount",
]);
const symbols = new Set([
  "operation",
  "messageRef",
  "jobRef",
  "model",
  "purpose",
  "state",
  "reason",
  "code",
  "table",
  "constraint",
  "category",
  "relation",
  "timePrecision",
  "finishReason",
  "providerStatus",
]);
const booleans = new Set([
  "bounded",
  "embeddingUsed",
  "replayed",
  "quotaFailure",
  "cachedOutput",
  "presentationNormalized",
]);

export function debugRef(id: string) {
  return createHash("sha256").update(id).digest("hex").slice(0, 12);
}
export function debugMessage(messageId: string) {
  const current = context.getStore();
  if (current) current.messageRef = debugRef(messageId);
}
export function aiDebug(event: string, fields: Record<string, unknown> = {}) {
  if (!enabled()) return;
  try {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (
        numbers.has(key) &&
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0
      )
        safe[key] = value;
      if (
        symbols.has(key) &&
        typeof value === "string" &&
        /^[a-zA-Z0-9_.:-]{1,120}$/.test(value)
      )
        safe[key] = value;
      if (booleans.has(key) && typeof value === "boolean") safe[key] = value;
    }
    const current = context.getStore();
    console.info(
      "[MHISTREE AI]",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        ...current,
        startedAt: undefined,
        elapsedMs: current ? Date.now() - current.startedAt : undefined,
        event: /^[a-z][a-z0-9_.-]{0,80}$/.test(event) ? event : "debug.event",
        ...safe,
      }),
    );
  } catch {
    /* Diagnostics must never change clinical/request behavior. */
  }
}
export function aiDebugError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
) {
  try {
    const value =
      error && typeof error === "object"
        ? (error as Record<string, unknown>)
        : {};
    aiDebug(event, {
      ...fields,
      code:
        value.code ??
        (value.name === "ZodError" || value.name === "SyntaxError"
          ? "VALIDATION_FAILED"
          : "UNEXPECTED_ERROR"),
      table: value.table,
      constraint: value.constraint,
    });
  } catch {
    /* Even an error object's getters must not change request behavior. */
  }
}
export async function withAIDebug<T>(
  fields: { operation: string; messageRef?: string; jobRef?: string },
  work: () => Promise<T>,
): Promise<T> {
  const parent = context.getStore();
  const operation = /^[a-z][a-z0-9_.-]{0,80}$/.test(fields.operation)
    ? fields.operation
    : "unknown";
  const ref = (value: string | undefined) =>
    value && /^[a-f0-9]{12}$/.test(value) ? value : undefined;
  return context.run(
    {
      traceId: parent?.traceId ?? randomUUID(),
      startedAt: parent?.startedAt ?? Date.now(),
      ...parent,
      operation,
      messageRef: ref(fields.messageRef) ?? parent?.messageRef,
      jobRef: ref(fields.jobRef) ?? parent?.jobRef,
    },
    async () => {
      aiDebug("operation.start");
      try {
        const result = await work();
        aiDebug("operation.complete");
        return result;
      } catch (error) {
        aiDebugError("operation.failed", error);
        throw error;
      }
    },
  );
}
