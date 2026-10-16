import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

// TEMPORARY: remove this file and its imports/calls after diagnosing signup.
// Enabled locally by default. In production opt in with AUTH_DEBUG=1.
const context = new AsyncLocalStorage<{ requestId: string; stage: string }>();
const enabled = () =>
  process.env.AUTH_DEBUG === "1" ||
  (process.env.NODE_ENV !== "production" && process.env.AUTH_DEBUG !== "0");
export function withAuthDebug<T>(work: () => T): T {
  return context.run({ requestId: randomUUID(), stage: "auth.request" }, work);
}
export function authDebugStage(stage: string) {
  const current = context.getStore();
  if (current) current.stage = stage;
  if (enabled()) console.info("[TEMP AUTH DEBUG]", { ...current, stage });
}
export function authDebugError(error: unknown) {
  if (!enabled()) return;
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
  console.error("[TEMP AUTH DEBUG] failure", {
    ...context.getStore(),
    name: safe("name"),
    code: safe("code"),
    status: typeof value.status === "number" ? value.status : undefined,
    schema: safe("schema"),
    table: safe("table"),
    constraint: safe("constraint"),
    hint:
      value.code === "42P01"
        ? "Database table is missing; check applied migrations."
        : value.code === "ECONNREFUSED"
          ? "Database/provider connection refused."
          : value.code === "42703"
            ? "Database column is missing; check applied migrations."
            : value.code === "CONFIGURATION_REQUIRED"
              ? "Check server environment configuration for this stage."
              : "Inspect the stage and error code; no underlying fix has been applied.",
  });
}
