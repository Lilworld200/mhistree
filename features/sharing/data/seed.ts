import { AVATARS, CLINICIAN, PATIENT } from "@/lib/demo/people";
import type { AccessEntry, Lease } from "../types";

const T0 = Date.now();

export const seedLeases: Lease[] = [
  {
    id: "L-2481",
    code: "MH-482913",
    actor: CLINICIAN.name,
    org: CLINICIAN.org,
    img: AVATARS.amara,
    purpose: "Consultation",
    scope: ["Health events", "Medications", "Labs", "Vitals", "Documents"],
    issuedAt: "Today 2:09 PM",
    expiresAt: T0 + 26 * 60000,
    status: "active",
  },
];

export const seedAccessLog: AccessEntry[] = [
  {
    actor: CLINICIAN.name,
    action: "Redeemed lease · viewed Health Context",
    at: "Today 2:09 PM",
    purpose: "Consultation",
  },
  {
    actor: PATIENT.name,
    action: "Created access lease L-2481",
    at: "Today 2:08 PM",
    purpose: "Consultation",
  },
];
