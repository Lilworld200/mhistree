import type { DocumentRecord } from "../types";

export const seedDocuments: DocumentRecord[] = [
  { id: "d1", name: "Blood test — FBC", type: "Lab result", date: "15 Aug 2026", facility: "Central Clinic", extracted: ["Hb 13.8 g/dL — normal", "WBC within range"], linked: ["e5"] },
  { id: "d2", name: "Prescription — Salbutamol", type: "Prescription", date: "12 Aug 2026", facility: "Central Clinic", extracted: ["Salbutamol 100mcg inhaler", "2 puffs PRN before exertion"], linked: ["e4"] },
  { id: "d3", name: "Discharge summary", type: "Discharge", date: "04 Aug 2026", facility: "Central Clinic", extracted: ["Allergic reaction — resolved", "No respiratory sequelae"], linked: ["e8"] },
];
