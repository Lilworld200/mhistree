import { afterEach, expect, it, vi } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { SupabaseProvider } from "@/lib/auth/supabase";
import {
  openFlow,
  sealFlow,
  flowCookieOptions,
  verifierCookie,
  recoveryCookie,
} from "@/lib/auth/flow-cookie";
import { GET } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("keeps recovery proof encrypted and server-only after callback, clearing its verifier", async () => {
  vi.stubEnv("AUTH_FLOW_COOKIE_KEY", randomBytes(32).toString("hex"));
  vi.stubEnv("APP_ORIGIN", "https://mhistree.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "synthetic-public");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server");
  const exchange = vi
    .spyOn(SupabaseProvider.prototype, "exchange")
    .mockResolvedValue({
      token: "synthetic-proof",
      redirectType: "PASSWORD_RECOVERY",
    });
  vi.spyOn(SupabaseProvider.prototype, "verify").mockResolvedValue({
    methods: ["otp"],
  } as Awaited<ReturnType<SupabaseProvider["verify"]>>);
  const verifier = await sealFlow(
    "synthetic-verifier/recovery",
    "pkce-recovery",
  );
  const response = await GET(
    new NextRequest(
      "https://mhistree.example/auth/callback?flow=recovery&code=synthetic-code",
      { headers: { cookie: `${verifierCookie("recovery")}=${verifier}` } },
    ),
  );
  expect(exchange).toHaveBeenCalledWith("synthetic-code");
  expect(response.headers.get("location")).toBe(
    "https://mhistree.example/recovery/update",
  );
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(response.headers.get("set-cookie")).not.toContain("synthetic-proof");
  expect(
    await openFlow(response.cookies.get(recoveryCookie)?.value, "recovery"),
  ).toBe("synthetic-proof");
  expect(response.cookies.get(verifierCookie("recovery"))?.value).toBe("");
  expect(response.cookies.get("mhistree-session")).toBeUndefined();
});
it("uses the real SDK S256 challenge and exchanges with the same server verifier", async () => {
  const calls: { url: string; body: Record<string, string> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) });
      if (String(url).includes("recover")) return Response.json({});
      return Response.json({
        access_token: "synthetic-access",
        refresh_token: "synthetic-refresh",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: "synthetic-subject" },
      });
    }),
  );
  const provider = new SupabaseProvider(
    "http://127.0.0.1:9999",
    "synthetic-public",
    "synthetic-server",
  );
  await provider.resetEmail(
    "synthetic@example.com",
    "https://mhistree.example/auth/callback?flow=recovery",
  );
  const verifier = provider.verifier!;
  expect(verifier.endsWith("/recovery")).toBe(true);
  expect(calls[0].body.code_challenge_method).toBe("s256");
  expect(calls[0].body.code_challenge).toBe(
    createHash("sha256").update(verifier.split("/")[0]).digest("base64url"),
  );
  const callback = new SupabaseProvider(
    "http://127.0.0.1:9999",
    "synthetic-public",
    "synthetic-server",
    verifier,
  );
  expect(await callback.exchange("synthetic-code")).toEqual({
    token: "synthetic-access",
    redirectType: "PASSWORD_RECOVERY",
  });
  expect(calls[1].body).toEqual({
    auth_code: "synthetic-code",
    code_verifier: verifier.split("/")[0],
  });
  expect(callback.verifier).toBeNull();
});
it("encrypts and binds flow cookies; rejects tampering and a different purpose", async () => {
  vi.stubEnv("AUTH_FLOW_COOKIE_KEY", randomBytes(32).toString("hex"));
  const cookie = await sealFlow("secret-provider-token", "recovery");
  expect(cookie).not.toContain("secret-provider-token");
  expect(await openFlow(cookie, "recovery")).toBe("secret-provider-token");
  await expect(openFlow(cookie, "pkce-signup")).rejects.toThrow(
    "AUTH_REQUIRED",
  );
  await expect(
    openFlow(cookie.slice(0, -5) + "abcde", "recovery"),
  ).rejects.toThrow("AUTH_REQUIRED");
  expect(flowCookieOptions()).toMatchObject({
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
  });
});
it("rejects a callback without its browser verifier without contacting Supabase", async () => {
  vi.stubEnv("APP_ORIGIN", "https://mhistree.example");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await GET(
    new NextRequest(
      "https://mhistree.example/auth/callback?flow=recovery&code=stolen",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://mhistree.example/auth/confirm",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(fetch).not.toHaveBeenCalled();
});
