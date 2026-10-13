import { describe, it, expect } from "vitest";
import { databaseEnvironment } from "@/lib/env";
describe("server configuration", () => {
  it("fails closed without echoing secrets", () => {
    expect(() =>
      databaseEnvironment({ DATABASE_URL: "sensitive-invalid-value" }),
    ).toThrow("CONFIGURATION_REQUIRED");
  });
  it("rejects insecure remote database connections", () => {
    expect(() =>
      databaseEnvironment({
        DATABASE_URL: "postgres://a:b@remote.example/db",
        DATABASE_SSL: "local",
      }),
    ).toThrow();
  });
  it("accepts a loopback-only test database", () => {
    expect(
      databaseEnvironment({
        DATABASE_URL: "postgres://localhost/db",
        DATABASE_SSL: "local",
      }).DATABASE_SSL,
    ).toBe("local");
  });
});
