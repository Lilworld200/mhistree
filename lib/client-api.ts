export async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error?.code ?? "PROVIDER_UNAVAILABLE");
  return result.data as T;
}
export function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  return (
    (
      {
        MEMORY_PREPARATION_REQUIRED:
          "Earlier conversation memory is still preparing. Retry preparation or choose to continue with existing memory.",
        DATABASE_PERMISSION_DENIED:
          "This service could not access required data. Please contact Mhistree support. Your saved information is retained.",
        DATABASE_UNAVAILABLE:
          "The database connection is temporarily unavailable. Please try again. Your unsaved input is retained.",
        EMAIL_DELIVERY_UNAVAILABLE:
          "Email delivery is not configured for this address yet. Please contact Mhistree support.",
        AUTH_REQUIRED:
          "Check your email and password, and verify your email before signing in.",
        SESSION_RETIRED: "Your session ended. Please sign in again.",
        TOKEN_INVALID:
          "This setup code is invalid, expired, already used or replaced. Ask the issuing care team for a replacement.",
        VERSION_CONFLICT:
          "This information changed. Reload and review before saving again.",
        RATE_LIMITED: "Too many attempts. Please wait before trying again.",
        VALIDATION_FAILED: "Check the fields and try again.",
        CONFIGURATION_REQUIRED:
          "This service needs local configuration before it can run.",
        ACCESS_DENIED: "This action is not permitted.",
        IDENTITY_REVIEW_REQUIRED:
          "Identity or ownership needs further review. Records remain separate.",
      } as Record<string, string>
    )[code] ??
    "The service is unavailable. Your saved information is retained. Please retry."
  );
}
