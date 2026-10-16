import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { decodeJwt } from "jose";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

const options = {
  auth: {
    flowType: "pkce" as const,
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
export class SupabaseProvider {
  readonly name = "supabase";
  readonly publicClient: SupabaseClient;
  private adminClient: SupabaseClient;
  verifier: string | null;
  constructor(
    url: string,
    publishableKey: string,
    serverKey: string,
    verifier: string | null = null,
  ) {
    this.verifier = verifier;
    const host = new URL(url);
    if (host.protocol !== "https:" && host.hostname !== "127.0.0.1")
      throw new DomainError("CONFIGURATION_REQUIRED");
    this.publicClient = createClient(url, publishableKey, {
      ...options,
      auth: {
        ...options.auth,
        persistSession: true,
        storage: {
          getItem: (key: string) =>
            key.endsWith("-code-verifier") && this.verifier
              ? JSON.stringify(this.verifier)
              : null,
          setItem: (key: string, value: string) => {
            if (key.endsWith("-code-verifier"))
              this.verifier = JSON.parse(value);
          },
          removeItem: (key: string) => {
            if (key.endsWith("-code-verifier")) this.verifier = null;
          },
        },
      },
    });
    this.adminClient = createClient(url, serverKey, options);
  }
  async exchange(code: string) {
    const recovery = this.verifier?.endsWith("/recovery");
    const { data, error } =
      await this.publicClient.auth.exchangeCodeForSession(code);
    if (error || !data.session) throw new DomainError("AUTH_REQUIRED");
    return {
      token: data.session.access_token,
      redirectType: recovery ? "PASSWORD_RECOVERY" : null,
    };
  }
  async signup(email: string, password: string, redirectTo: string) {
    const { data, error } = await this.publicClient.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });
    if (error)
      throw new DomainError(
        error.code === "email_address_not_authorized"
          ? "EMAIL_DELIVERY_UNAVAILABLE"
          : error.status === 429
            ? "RATE_LIMITED"
            : "PROVIDER_UNAVAILABLE",
      );
    // Supabase deliberately obscures an already registered email. Never bind its
    // obfuscated user object to a new person or an invitation.
    return data.user?.identities?.length ? data.user.id : null;
  }
  async verify(token: string) {
    const { data, error } = await this.publicClient.auth.getUser(token);
    if (error || !data.user?.email || !data.user.email_confirmed_at)
      throw new DomainError("AUTH_REQUIRED");
    // getUser verifies this exact JWT with the provider before decoding claims.
    const claims = decodeJwt(token);
    if (
      claims.sub !== data.user.id ||
      !claims.exp ||
      !claims.iat ||
      typeof claims.session_id !== "string"
    )
      throw new DomainError("AUTH_REQUIRED");
    return {
      user: data.user,
      subject: data.user.id,
      expiresAt: new Date(claims.exp * 1000),
      providerSessionId: claims.session_id,
      issuedAt: claims.iat,
      methods: Array.isArray(claims.amr)
        ? claims.amr.flatMap((entry) =>
            entry &&
            typeof entry === "object" &&
            "method" in entry &&
            typeof entry.method === "string"
              ? [entry.method]
              : [],
          )
        : [],
    };
  }
  async signIn(email: string, password: string) {
    z.email().parse(email);
    const { data, error } = await this.publicClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session)
      throw new DomainError(
        error?.status === 429 ? "RATE_LIMITED" : "AUTH_REQUIRED",
      );
    return {
      token: data.session.access_token,
      claims: await this.verify(data.session.access_token),
    };
  }
  async resetEmail(email: string, redirectTo: string) {
    const { error } = await this.publicClient.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );
    if (error)
      throw new DomainError(
        error.code === "email_address_not_authorized"
          ? "EMAIL_DELIVERY_UNAVAILABLE"
          : error.status === 429
            ? "RATE_LIMITED"
            : "PROVIDER_UNAVAILABLE",
      );
  }
  async resendVerification(email: string, redirectTo: string) {
    const { error } = await this.publicClient.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error)
      throw new DomainError(
        error.code === "email_address_not_authorized"
          ? "EMAIL_DELIVERY_UNAVAILABLE"
          : error.status === 429
            ? "RATE_LIMITED"
            : "PROVIDER_UNAVAILABLE",
      );
  }
  async updatePassword(token: string, password: string) {
    const proof = await this.verify(token);
    const { error } = await this.adminClient.auth.admin.signOut(
      token,
      "global",
    );
    if (error) throw new DomainError("PROVIDER_UNAVAILABLE");
    await this.setPatientPassword(proof.subject, password);
  }
  async setPatientPassword(subject: string, password: string) {
    const { error } = await this.adminClient.auth.admin.updateUserById(
      subject,
      { password, ban_duration: "none" },
    );
    if (error) throw new DomainError("PROVIDER_UNAVAILABLE");
  }
  async revokeSessions(subject: string) {
    // Disable the provider identity during reviewed recovery/retirement. Current
    // app-session epoch is still the immediate authority for all clinical reads.
    const { error } = await this.adminClient.auth.admin.updateUserById(
      subject,
      { ban_duration: "876000h" },
    );
    if (error) throw new DomainError("PROVIDER_UNAVAILABLE");
  }
  async ensureUser(): Promise<string> {
    // MVP activation requires patient-supplied email and verified signup.
    throw new DomainError("CONFIGURATION_REQUIRED");
  }
}
