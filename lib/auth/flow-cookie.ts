import "server-only";
import { EncryptJWT, jwtDecrypt } from "jose";
import { DomainError } from "@/lib/errors";
import { cookieOptions } from "@/lib/http";

export const recoveryCookie = "mhistree-email-recovery";
export const verifierCookie = (flow: string) => `mhistree-pkce-${flow}`;
export const flowCookieOptions = () => ({
  ...cookieOptions(),
  sameSite: "lax" as const,
  maxAge: 600,
});

function key() {
  const value = process.env.AUTH_FLOW_COOKIE_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value))
    throw new DomainError("CONFIGURATION_REQUIRED");
  return Buffer.from(value, "hex");
}
export async function sealFlow(value: string, purpose: string) {
  return new EncryptJWT({ value })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuer("mhistree")
    .setAudience(purpose)
    .setIssuedAt()
    .setExpirationTime(purpose.startsWith("pkce-") ? "1h" : "10m")
    .encrypt(key());
}
export async function openFlow(cookie: string | undefined, purpose: string) {
  if (!cookie) throw new DomainError("AUTH_REQUIRED");
  try {
    const { payload } = await jwtDecrypt(cookie, key(), {
      issuer: "mhistree",
      audience: purpose,
    });
    if (typeof payload.value !== "string")
      throw new DomainError("AUTH_REQUIRED");
    return payload.value;
  } catch {
    throw new DomainError("AUTH_REQUIRED");
  }
}
