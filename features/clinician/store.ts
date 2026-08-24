import { toast } from "@/components/ui/toast-store";
import { CLINICIAN } from "@/lib/demo/people";
import { create } from "zustand";

export interface ClinicianNote {
  id: string;
  text: string;
  by: string;
  at: string;
}

export interface ConsultEntry {
  q: string | null;
  a: string;
}

/* DEMO ADAPTER — canned patient-file reasoning over authorised evidence.
   Production path: POST /api/ai/chat scoped to active patient + lease,
   answered through the LLM Gateway (lib/ai/gateway.ts). */
const CANNED_ANSWERS: Record<string, string> = {
  "Summarize the last 30 days":
    "Aug: 8 events — 2 symptom reports (exertional breathlessness/wheeze), 1 device HR spike, inhaler started (verified), FBC within range (lab), GP visit 07 Aug. Trend: exertional pattern, improving since inhaler.",
  "What changed?":
    "Inhaler started 20 Aug (clinician-verified). Symptom reports clustered 17–19 Aug. No new labs since 15 Aug.",
  "What remains unverified?":
    "Symptom reports and the AI-inferred condition await your verification in the queue below.",
  "What information is missing?":
    "Spirometry result (scheduled 28 Aug), symptom severity scores, trigger confirmation, medication adherence.",
};

interface ClinicianState {
  notes: ClinicianNote[];
  consultFeed: ConsultEntry[];
  addNote: (text: string) => void;
  askPatient: (q: string) => void;
  resetConsultFeed: () => void;
}

export const useClinicianStore = create<ClinicianState>((set, get) => ({
  notes: [
    {
      id: "n1",
      text: "Patient reports exertional symptoms; spirometry scheduled.",
      by: CLINICIAN.name,
      at: "07 Aug",
    },
  ],
  consultFeed: [
    {
      q: null,
      a: "AI console scoped to Nati Adeyemi · Health Context · active lease. I can summarise evidence, surface gaps and rank hypotheses — verification stays with you.",
    },
  ],

  addNote(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    set({
      notes: [
        { id: "n" + Date.now(), text: trimmed, by: CLINICIAN.name, at: "Today" },
        ...get().notes,
      ],
    });
    toast("Note committed as clinician-authored fact", "check");
  },

  askPatient(q) {
    const question = q.trim();
    if (!question) return;
    const a =
      CANNED_ANSWERS[question] ??
      `Based on the authorised record: ${CANNED_ANSWERS["What changed?"]}`;
    set({ consultFeed: [...get().consultFeed, { q: question, a }] });
  },

  resetConsultFeed: () => set({ consultFeed: [] }),
}));
