import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const context = new AsyncLocalStorage<{
  requestId: string;
  stage: string;
  operation?: string;
  startedAt: number;
}>();

const disabled = () => process.env.AUTH_DEBUG === "0";
const isVerbose = () =>
  process.env.AUTH_DEBUG === "1" ||
  (process.env.NODE_ENV !== "production" && !disabled());

export function withAuthDebug<T>(work: () => T): T {
  return context.run(
    {
      requestId: randomUUID(),
      stage: "auth.request",
      startedAt: performance.now(),
    },
    work,
  );
}

export function authDebugOperation(operation: string) {
  if (disabled()) return;
  const current = context.getStore();
  if (current) current.operation = operation;
  console.info("[MHISTREE AUTH] start", {
    event: "auth.request.start",
    operation,
    requestId: current?.requestId,
  });
}

export function authDebugSuccess(operation: string, status = 200) {
  if (disabled()) return;
  const current = context.getStore();
  const elapsedMs = current
    ? Math.round(performance.now() - current.startedAt)
    : undefined;
  console.info("[MHISTREE AUTH] success", {
    event: "auth.request.success",
    operation: current?.operation ?? operation,
    status,
    elapsedMs,
    requestId: current?.requestId,
  });
}

export function authDebugStage(stage: string) {
  const current = context.getStore();
  if (current) current.stage = stage;
  if (isVerbose()) {
    console.info("[MHISTREE AUTH] stage", {
      event: "auth.stage",
      stage,
      operation: current?.operation,
      requestId: current?.requestId,
    });
  }
}

export function authDebugError(error: unknown, status?: number) {
  if (disabled()) return;
  const current = context.getStore();
  const elapsedMs = current
    ? Math.round(performance.now() - current.startedAt)
    : undefined;
  const value =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};
  const safe = (field: string) =>
    typeof value[field] === "string" &&
    /^[a-zA-Z0-9_.-]{1,100}$/.test(value[field] as string)
      ? value[field]
      : undefined;

  // Never log the error object, request body, SQL detail, cookies or raw message:
  // those can contain credentials, email addresses or patient information.
  console.error("[MHISTREE AUTH] failure", {
    event: "auth.request.failure",
    ...current,
    operation: current?.operation,
    stage: current?.stage,
    status,
    name: safe("name"),
    code: safe("code"),
    elapsedMs,
    schema: safe("schema"),
    table: safe("table"),
    constraint: safe("constraint"),
    hint:
      value.code === "ENOENT"
        ? "File not found on filesystem. Check bundle output and file path."
        : value.code === "SELF_SIGNED_CERT_IN_CHAIN"
          ? "Database TLS rejected custom/self-signed CA; ensure DATABASE_SSL_CA or cert file is supplied."
          : value.code === "42P01"
            ? "Database table is missing; check applied migrations."
            : value.code === "ECONNREFUSED"
              ? "Database/provider connection refused."
              : value.code === "ETIMEDOUT"
                ? "Database connection timed out. Check network or pooler port."
                : value.code === "42703"
                  ? "Database column is missing; check applied migrations."
                  : value.code === "CONFIGURATION_REQUIRED"
                    ? "Check server environment configuration for this stage."
                    : "Inspect the stage and error code; no underlying fix has been applied.",
  });
}
