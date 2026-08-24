export const LEASE_PURPOSES = [
  "Consultation",
  "Emergency",
  "Referral",
  "Claims / HMO",
] as const;
export type LeasePurpose = (typeof LEASE_PURPOSES)[number];

export const SCOPE_OPTIONS = [
  "Health events",
  "Medications",
  "Labs",
  "Vitals",
  "Documents",
] as const;
export type ScopeCategory = (typeof SCOPE_OPTIONS)[number];

export type LeaseStatus = "active" | "revoked" | "expired";

export interface Lease {
  id: string;
  code: string;
  actor: string;
  org: string;
  img?: string;
  purpose: string;
  scope: string[];
  issuedAt: string;
  expiresAt: number;
  status: LeaseStatus;
}

export interface AccessEntry {
  actor: string;
  action: string;
  at: string;
  purpose: string;
}

export interface CreateLeaseInput {
  purpose: string;
  scope: string[];
  minutes: number;
}
