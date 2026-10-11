export type ErrorCode =
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
