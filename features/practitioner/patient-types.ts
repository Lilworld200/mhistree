export type PatientExcerpt = {
  id: string;
  text: string;
  category: string;
  sourceStatus: string;
  status: string;
  recordedAt: string;
};
export type PatientOverview = {
  historyCounts?: { category: string; count: number }[];
  summaryKind: "today" | "overview";
  asOf: string;
  timezone: string;
  summary: PatientExcerpt[];
  medications: PatientExcerpt[];
  prescriptions: PatientExcerpt[];
  results: PatientExcerpt[];
  limited: boolean;
};
export type DirectPatient = {
  id: string;
  overview?: PatientOverview | null;
  display_name: string;
  patient_person_id: string;
  status: "active" | "pending" | "revoked";
  categories?: string[];
  exclusions?: string[];
  revision?: number;
  patient_approved?: boolean;
  practitioner_approved?: boolean;
};
export type AssignedPatient = {
  overview?: PatientOverview | null;
  assignment_id: string;
  organization_id: string;
  organization_name: string;
  connection_id: string | null;
  basis_id?: string | null;
  display_name: string;
  categories?: string[];
};
export type PatientCapabilities = {
  lookup: boolean;
  register: boolean;
  connect: boolean;
};
export type PatientCandidate = {
  personId: string;
  displayName: string;
  reviewRequired: boolean;
};
