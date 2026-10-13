import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

export type ProviderConfig = {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: string;
};
export class KeycloakProvider {
  readonly issuer: string;
  private keys: ReturnType<typeof createRemoteJWKSet>;
  constructor(private config: ProviderConfig) {
    const url = new URL(config.baseUrl);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && url.hostname === "127.0.0.1")
    )
      throw new DomainError("CONFIGURATION_REQUIRED");
    this.issuer = `${config.baseUrl}/realms/${encodeURIComponent(config.realm)}`;
    this.keys = createRemoteJWKSet(
      new URL(`${this.issuer}/protocol/openid-connect/certs`),
    );
  }
  private async request(url: string, options: RequestInit = {}) {
    try {
      return await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new DomainError("PROVIDER_UNAVAILABLE");
    }
  }
  private async serviceToken() {
    const result = await this.request(
      `${this.issuer}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      },
    );
    if (!result.ok) throw new DomainError("PROVIDER_UNAVAILABLE");
    return z.object({ access_token: z.string() }).parse(await result.json())
      .access_token;
  }
  private async admin(path: string, method = "GET", body?: unknown) {
    const token = await this.serviceToken();
    const response = await this.request(
      `${this.config.baseUrl}/admin/realms/${encodeURIComponent(this.config.realm)}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    if (!response.ok) throw new DomainError("PROVIDER_UNAVAILABLE");
    return response;
  }
  async ensureUser(username: string) {
    const find = async () =>
      z
        .array(z.object({ id: z.string(), username: z.string() }))
        .parse(
          await (
            await this.admin(
              `/users?username=${encodeURIComponent(username)}&exact=true`,
            )
          ).json(),
        );
    let users = await find();
    if (!users.length) {
      await this.admin("/users", "POST", {
        username,
        enabled: true,
        requiredActions: [],
      });
      users = await find();
    }
    if (users.length !== 1 || users[0].username !== username)
      throw new DomainError("PROVIDER_UNAVAILABLE");
    return users[0].id;
  }
  async setPatientPassword(subject: string, password: string) {
    await this.admin(
      `/users/${encodeURIComponent(subject)}/reset-password`,
      "PUT",
      { type: "password", value: password, temporary: false },
    );
  }
  async revokeSessions(subject: string) {
    await this.admin(`/users/${encodeURIComponent(subject)}/logout`, "POST");
  }
  async signIn(identifier: string, password: string) {
    const response = await this.request(
      `${this.issuer}/protocol/openid-connect/token`,
      {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "password",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          username: identifier,
          password,
        }),
      },
    );
    if (!response.ok)
      throw new DomainError(
        response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "AUTH_REQUIRED",
      );
    const result = z
      .object({ access_token: z.string() })
      .parse(await response.json());
    return {
      token: result.access_token,
      claims: await this.verify(result.access_token),
    };
  }
  async verify(token: string) {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.issuer,
        algorithms: ["RS256"],
      });
      if (
        !payload.sub ||
        !payload.exp ||
        !payload.sid ||
        payload.azp !== this.config.clientId
      )
        throw new Error("Wrong client");
      return {
        subject: payload.sub,
        expiresAt: new Date(payload.exp * 1000),
        providerSessionId: String(payload.sid),
      };
    } catch {
      throw new DomainError("AUTH_REQUIRED");
    }
  }
}
