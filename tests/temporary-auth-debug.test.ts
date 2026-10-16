import { afterEach, expect, it, vi } from "vitest";
import {
  authDebugError,
  authDebugStage,
  withAuthDebug,
} from "@/lib/auth/temporary-debug";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("logs the failing stage and database code without logging sensitive error data", () => {
  vi.stubEnv("AUTH_DEBUG", "1");
  vi.spyOn(console, "info").mockImplementation(() => {});
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  withAuthDebug(() => {
    authDebugStage("signup.database-enrollment-lookup");
    authDebugError(
      Object.assign(new Error("secret-password private@example.com"), {
        code: "42P01",
        detail: "secret-token",
        table: "email_enrollments",
      }),
    );
  });
  const output = JSON.stringify(log.mock.calls);
  expect(output).toContain("signup.database-enrollment-lookup");
  expect(output).toContain("42P01");
  expect(output).not.toMatch(
    /secret-password|private@example.com|secret-token/,
  );
});
it("can be disabled without changing application behavior", () => {
  vi.stubEnv("AUTH_DEBUG", "0");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  authDebugError(new Error("synthetic"));
  expect(log).not.toHaveBeenCalled();
});
