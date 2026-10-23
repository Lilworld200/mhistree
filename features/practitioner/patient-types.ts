export type DirectPatient = {
  id: string;
  display_name: string;
  patient_person_id: string;
  status: "active" | "pending" | "revoked";
  categories?: string[];
  exclusions?: string[];
};
export type AssignedPatient = {
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
