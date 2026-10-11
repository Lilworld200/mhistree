/* ────────────────────────────────────────────────────────────────
   Shared demo identities used across feature seeds.
   Replace with Supabase-backed profile data when the data layer
   lands (see lib/supabase/).
   ──────────────────────────────────────────────────────────────── */

export const PATIENT = {
  name: "Nati Adeyemi",
  preferredName: "Nati",
  age: 24,
  bloodGroup: "O+",
  genotype: "AS",
  allergy: "Penicillin",
  email: "nati@mhistree.app",
  phone: "+234 802 000 0000",
} as const;

export const CLINICIAN = {
  name: "Dr. Amara Okafor",
  role: "GP · Central Clinic",
  org: "Central Clinic",
} as const;

const AVATAR_BASE =
  "https://image.qwenlm.ai/public_source/8ff8a3ec-830a-40fa-9fdd-950cbbaec993";

export const AVATARS = {
  nati: `${AVATAR_BASE}/14d66c277-d123-4015-af6a-cea20297d767.png`,
  amara: `${AVATAR_BASE}/18a638ebf-1faa-4474-a4fa-c1da6ce0f3b9.png`,
  tunde: `${AVATAR_BASE}/17bcbaefa-7453-4711-b58e-09d279efd2c3.png`,
  ifeoma: `${AVATAR_BASE}/101a309b8-9e7a-47ab-98a5-94fd07ee0425.png`,
  emeka: `${AVATAR_BASE}/16ef61bdb-0088-477f-b537-cbab158f79ee.png`,
} as const;

export interface CareTeamMember {
  name: string;
  role: string;
  img?: string;
  ring: string;
}

export const CARE_TEAM: CareTeamMember[] = [
  { name: "Dr. Amara Okafor", role: "GP · Central Clinic", img: AVATARS.amara, ring: "#F4A8AC" },
  { name: "Dr. Tunde Bakare", role: "Cardiology", img: AVATARS.tunde, ring: "#B7E4C7" },
  { name: "Nurse Ifeoma", role: "Care team", img: AVATARS.ifeoma, ring: "#FBD9A0" },
  { name: "Dr. Emeka Obi", role: "Pulmonology", img: AVATARS.emeka, ring: "#C7C6F2" },
];
