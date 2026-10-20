import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/auth/[operation]/route";
import { GET } from "@/app/auth/callback/route";
import { entryCookie, professionalEntryPath } from "@/features/auth/entry-path";
import { sealFlow, verifierCookie } from "@/lib/auth/flow-cookie";
const { login, signup, confirm } = vi.hoisted(() => ({
  login: vi.fn(),
  signup: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ database: () => ({}) }));
vi.mock("@/lib/auth/config", () => ({
  authenticationProvider: () => ({
    verifier: "synthetic-pkce",
    exchange: async () => ({
      token: "synthetic-token",
      redirectType: "SIGNED_IN",
    }),
  }),
}));
vi.mock("@/features/auth/email", () => ({
  loginEmail: login,
  signupEmail: signup,
  confirmEmail: confirm,
  setupEmail: vi.fn(),
  requestEmailReset: vi.fn(),
  resetEmailPassword: vi.fn(),
  resendVerification: vi.fn(),
}));
function environment() {
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3101");
  vi.stubEnv("AUTH_FLOW_COOKIE_KEY", "ab".repeat(32));
  login.mockResolvedValue({
    session: "synthetic",
    expiresAt: new Date(Date.now() + 60000),
  });
  signup.mockResolvedValue({ verificationRequired: true });
  confirm.mockResolvedValue({
    session: "synthetic",
    expiresAt: new Date(Date.now() + 60000),
  });
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
async function post(operation: string, body: object) {
  return POST(
    new NextRequest(`http://127.0.0.1:3101/api/auth/${operation}`, {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ operation }) },
  );
}
it.each(["practitioner", "organization"])(
  "%s login returns a fixed professional entry path without granting roles",
  async (entry) => {
    environment();
    const response = await post("login", {
      identifier: "synthetic@example.com",
      password: "test-password",
      entry,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).data.next).toBe(
      professionalEntryPath(entry),
    );
    expect(login.mock.calls[0].slice(2, 4)).toEqual([
      "synthetic@example.com",
      "test-password",
    ]);
  },
);
it("patient login stays on chat and arbitrary entry/redirect values are rejected", async () => {
  environment();
  expect(
    (
      await (
        await post("login", { identifier: "a@example.com", password: "test" })
      ).json()
    ).data.next,
  ).toBe("/chat");
  const invalid = await post("login", {
    identifier: "a@example.com",
    password: "test",
    entry: "https://example.com",
  });
  expect(invalid.status).toBe(422);
  expect(professionalEntryPath("//example.com")).toBe("/chat");
});
it("signup intent is only a return-path cookie and is stripped before identity enrollment", async () => {
  environment();
  const credentials = {
    displayName: "Synthetic applicant",
    email: "a@example.com",
    password: "synthetic-password",
    requestKey: "x".repeat(43),
  };
  const response = await post("signup", {
    ...credentials,
    entry: "organization",
  });
  expect(response.status).toBe(200);
  expect(signup.mock.calls[0][2]).toEqual(credentials);
  expect(response.cookies.get(entryCookie)?.value).toBe("organization");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});
it.each(["practitioner", "organization", "https://example.com"])(
  "verified callback validates %s navigation intent and consumes it",
  async (entry) => {
    environment();
    const verifier = await sealFlow("synthetic-pkce", "pkce-signup");
    const response = await GET(
      new NextRequest(
        "http://127.0.0.1:3101/auth/callback?flow=signup&code=synthetic",
        {
          headers: {
            cookie: `${verifierCookie("signup")}=${verifier}; ${entryCookie}=${entry}`,
          },
        },
      ),
    );
    expect(response.headers.get("location")).toBe(
      `http://127.0.0.1:3101${professionalEntryPath(entry)}`,
    );
    expect(response.cookies.get(entryCookie)?.value).toBe("");
    expect(confirm).toHaveBeenCalledOnce();
  },
);
