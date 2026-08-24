import type { ChatMessage, ChatSession } from "../types";

export const seedSessions: ChatSession[] = [
  { id: "s1", title: "Evening breathing check", group: "Today" },
  { id: "s2", title: "Exam stress & sleep", group: "Yesterday" },
  { id: "s3", title: "Headache after football", group: "Previous 7 days" },
];

export const seedMessages: Record<string, ChatMessage[]> = {
  s1: [
    { id: "m1", role: "user", text: "Today was exhausting. I had school practicals, skipped lunch, and around 7pm I was breathing heavily for about 20 minutes." },
    { id: "m2", role: "sys", text: "Saved to your health timeline · Breathing difficulty (reported)", evId: "e1" },
    { id: "m3", role: "ai", text: "That sounds like it came on pretty suddenly. You mentioned the breathing got heavy around 7pm and lasted about 20 minutes — is it completely gone now, or are you still feeling it?" },
  ],
  s2: [
    { id: "m4", role: "user", text: "Exams are killing me, slept like 5 hours again 😅" },
    { id: "m5", role: "ai", text: "Five hours during exam season is rough. I’ll keep the sleep pattern in mind — if it continues, it’s worth mentioning to your doctor, since poor sleep also makes breathing symptoms feel worse." },
  ],
  s3: [
    { id: "m6", role: "user", text: "Had a mild headache after football yesterday evening." },
    { id: "m7", role: "sys", text: "Saved to your health timeline · Headache (reported)", evId: "e2" },
    { id: "m8", role: "ai", text: "Noted. A mild headache after exertion is usually dehydration or heat — but I’ve linked it with your evening wheeze pattern so your clinician sees the whole picture." },
  ],
};
