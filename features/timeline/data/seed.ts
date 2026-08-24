import type { Episode, TimelineEvent } from "../model";

const T0 = Date.now();

export const seedEvents: TimelineEvent[] = [
  { id: "e1", type: "Symptom", title: "Breathing difficulty", when: "19 Aug · 7:00 PM", ts: T0 - 86e6, desc: "Breathing heavily for ~20 minutes after school practicals; skipped lunch.", src: "self", status: "reported", ep: "ep1", session: "s1", sourceMsg: "“Today was exhausting… around 7pm I was breathing heavily for about 20 minutes.”" },
  { id: "e2", type: "Symptom", title: "Evening wheeze after exertion", when: "17 Aug · 8:15 PM", ts: T0 - 259e6, desc: "Wheeze noticed after evening football, resolved with rest.", src: "self", status: "reported", ep: "ep1", session: "s3", sourceMsg: "“After football I could hear a slight wheeze in the evening.”" },
  { id: "e3", type: "Vital", title: "Heart rate 118 bpm at rest", when: "19 Aug · 7:40 PM", ts: T0 - 84e6, desc: "Wearable reading shortly after breathing episode.", src: "device", status: "reported", ep: "ep1", sourceMsg: "Wearable stream · HR 118 bpm (rest)." },
  { id: "e4", type: "Medication", title: "Salbutamol inhaler started", when: "20 Aug · 9:00 AM", ts: T0 - 80e6, desc: "2 puffs as needed, before exertion. Prescribed at Central Clinic.", src: "clinician", status: "verified", verifiedBy: "Dr. Amara Okafor", sourceMsg: "Prescription record · Central Clinic." },
  { id: "e5", type: "Lab", title: "Full blood count — within range", when: "15 Aug", ts: T0 - 5e8, desc: "No anemia or infection markers. Document linked.", src: "lab", status: "verified", docId: "d1", sourceMsg: "Lab document · Central Clinic pathology." },
  { id: "e6", type: "Visit", title: "GP consultation — Central Clinic", when: "07 Aug", ts: T0 - 12e8, desc: "Reviewed exertional symptoms; spirometry requested.", src: "clinician", status: "verified", verifiedBy: "Dr. Amara Okafor", sourceMsg: "Encounter record · Central Clinic." },
  { id: "e7", type: "Condition", title: "Possible exercise-induced asthma", when: "20 Aug", ts: T0 - 79e6, desc: "Pattern of evening wheeze + exertional breathlessness. Awaiting spirometry.", src: "ai", status: "inferred", support: 62, sourceMsg: "Derived from e1, e2, e3 by extraction worker." },
  { id: "e8", type: "Document", title: "Discharge summary received", when: "04 Aug", ts: T0 - 15e8, desc: "Observation stay after allergic reaction; resolved.", src: "clinician", status: "verified", docId: "d3", sourceMsg: "Document · Central Clinic records." },
];

export const seedEpisodes: Episode[] = [
  {
    id: "ep1",
    title: "Respiratory symptoms",
    span: "17–21 Aug",
    count: 4,
    trend: "improving",
    summary: "Evening breathlessness and wheeze after exertion, one elevated resting HR reading, inhaler started. Trend: improving.",
    eventIds: ["e1", "e2", "e3", "e4"],
  },
];
