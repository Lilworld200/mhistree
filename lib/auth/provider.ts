export interface CredentialProvider {
  readonly name?: string;
  ensureUser(identifier: string): Promise<string>;
  setPatientPassword(subject: string, password: string): Promise<void>;
  revokeSessions(subject: string): Promise<void>;
  signIn(
    identifier: string,
    password: string,
  ): Promise<{
    token: string;
    claims: { subject: string; expiresAt: Date; providerSessionId: string };
  }>;
}
