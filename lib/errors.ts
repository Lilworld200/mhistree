export type ErrorCode =
  | "MEMORY_PREPARATION_REQUIRED"
  | "DATABASE_PERMISSION_DENIED"
  | "DATABASE_SCHEMA_REQUIRED"
  | "DATABASE_UNAVAILABLE"
  | "VALIDATION_FAILED"
  | "EMAIL_DELIVERY_UNAVAILABLE"
  | "IDENTITY_REVIEW_REQUIRED"
  | "AUTH_REQUIRED"
  | "SESSION_RETIRED"
  | "ACCESS_DENIED"
  | "ACCESS_REVOKED"
  | "CONSENT_REQUIRED"
  | "TOKEN_INVALID"
  | "VERSION_CONFLICT"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "CONFIGURATION_REQUIRED";
export class DomainError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = "DomainError";
  }
}

export function applicationErrorCode(error: unknown): ErrorCode {
  if (error instanceof DomainError) return error.code;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    ["42P01", "42703"].includes(String(error.code))
  )
    return "DATABASE_SCHEMA_REQUIRED";
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "42501"
  )
    return "DATABASE_PERMISSION_DENIED";
  return "PROVIDER_UNAVAILABLE";
}
