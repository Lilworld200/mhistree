import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { mutationGuard } from "@/lib/http";

afterEach(() => vi.unstubAllEnvs());
it("canonicalizes local auth navigation before signup and preserves its query", () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  const response = proxy(
    new NextRequest("http://localhost:3101/auth?method=code"),
  );
  expect(response.headers.get("refresh")).toBe(
    "0;url=http://127.0.0.1:3101/auth?method=code",
  );
  expect(() =>
    mutationGuard(
      new Request("http://127.0.0.1:3101/api/auth/signup", {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3101",
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
  ).not.toThrow();
});
it("keeps foreign, missing and cross-site mutation origins rejected", () => {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  for (const [origin, site] of [
    ["https://evil.example", "cross-site"],
    ["", "same-origin"],
    ["http://127.0.0.1:3101", "cross-site"],
  ]) {
    expect(() =>
      mutationGuard(
        new Request("http://127.0.0.1:3101/api/auth/signup", {
          method: "POST",
          headers: {
            origin,
            "sec-fetch-site": site,
            "content-type": "application/json",
          },
        }),
      ),
    ).toThrow("ACCESS_DENIED");
  }
});
it("does not redirect deployed hosts, differing ports or POST requests", () => {
  vi.stubEnv("APP_ORIGIN", "https://mhistree.example");
  expect(
    proxy(new NextRequest("https://other.example/auth")).headers.get(
      "location",
    ),
  ).toBeNull();
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  expect(
    proxy(new NextRequest("http://localhost:3000/auth")).headers.get(
      "location",
    ),
  ).toBeNull();
  expect(
    proxy(
      new NextRequest("http://localhost:3101/auth", { method: "POST" }),
    ).headers.get("location"),
  ).toBeNull();
});
