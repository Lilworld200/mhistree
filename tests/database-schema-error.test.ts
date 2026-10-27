import { afterEach, expect, it, vi } from "vitest";
import { applicationErrorCode } from "@/lib/errors";
import { failure } from "@/lib/http";
import { errorMessage } from "@/lib/client-api";

afterEach(() => vi.restoreAllMocks());
it.each(["42P01", "42703"])(
  "identifies missing database schema (%s) without leaking SQL or blaming the AI provider",
  async (sqlState) => {
    const error = Object.assign(new Error("private relation name and SQL"), {
      code: sqlState,
    });
    expect(applicationErrorCode(error)).toBe("DATABASE_SCHEMA_REQUIRED");
    const response = failure(error);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("DATABASE_SCHEMA_REQUIRED");
    expect(JSON.stringify(body)).not.toMatch(/private|relation name|SQL/);
    expect(errorMessage(new Error(body.error.code))).toContain(
      "database needs an application update",
    );
  },
);

it("retains the distinction between database permissions and provider failures", () => {
  expect(applicationErrorCode({ code: "42501" })).toBe(
    "DATABASE_PERMISSION_DENIED",
  );
  expect(applicationErrorCode(new Error("upstream failure"))).toBe(
    "PROVIDER_UNAVAILABLE",
  );
});
