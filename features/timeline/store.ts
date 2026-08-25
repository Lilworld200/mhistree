import { toast } from "@/components/ui/toast-store";
import { CLINICIAN } from "@/lib/demo/people";
import { create } from "zustand";
import { seedEpisodes, seedEvents } from "./data/seed";
import type {
  Episode,
  EventType,
  ProvenanceSource,
  TimelineEvent,
} from "./model";

interface ReportEventInput {
  type: EventType;
  title: string;
  desc: string;
  sessionId?: string;
}

interface TimelineState {
  events: TimelineEvent[];
  episodes: Episode[];
  typeFilter: string;
  srcFilter: string;
  evidenceId: string | null;
  correctionId: string | null;

  setTypeFilter: (label: string) => void;
  setSrcFilter: (label: string) => void;

  addReportedEvent: (input: ReportEventInput) => string;

  verify: (id: string, by?: string) => void;
  reject: (id: string) => void;
  dispute: (id: string) => void;
  correct: (id: string, note: string) => void;

  openEvidence: (id: string) => void;
  closeEvidence: () => void;
  openCorrection: (id: string) => void;
  closeCorrection: () => void;
  fetchLiveEvents: (patientId: string) => Promise<void>;
}

const now = () => Date.now();
const today = () => "Today · now";
const todayLabel = () => "Today";

export const useTimelineStore = create<TimelineState>((set, get) => ({
  events: seedEvents,
  episodes: seedEpisodes,
  typeFilter: "All",
  srcFilter: "All",
  evidenceId: null,
  correctionId: null,

  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setSrcFilter: (srcFilter) => set({ srcFilter }),

  addReportedEvent: ({ type, title, desc, sessionId }) => {
    const id = "e" + now();
    const ev: TimelineEvent = {
      id,
      type,
      title,
      when: today(),
      ts: now(),
      desc,
      src: "self",
      status: "reported",
      session: sessionId,
      sourceMsg: `“${desc}”`,
    };
    set({ events: [ev, ...get().events] });
    return id;
  },

  verify: (id, by = CLINICIAN.name) => {
    set({
      events: get().events.map((e) =>
        e.id === id
          ? {
              ...e,
              status: "verified",
              verifiedBy: by,
              verifiedAt: todayLabel(),
            }
          : e,
      ),
    });
    const ev = get().events.find((e) => e.id === id);
    toast(`Event verified · provenance recorded${ev ? ` — ${ev.title}` : ""}`);
  },

  reject: (id) => {
    set({
      events: get().events.map((e) =>
        e.id === id ? { ...e, status: "rejected" } : e,
      ),
    });
    toast("Event rejected · original preserved", "x");
  },

  dispute: (id) => {
    set({
      events: get().events.map((e) =>
        e.id === id ? { ...e, status: "disputed" } : e,
      ),
      evidenceId: null,
    });
    toast("Marked as disputed · review requested", "alert");
  },

  correct: (id, note) => {
    set({
      events: get().events.map((e) =>
        e.id === id
          ? {
              ...e,
              status: "corrected",
              corrections: [
                ...(e.corrections ?? []),
                { note, at: todayLabel() },
              ],
            }
          : e,
      ),
      correctionId: null,
      evidenceId: null,
    });
    toast("Correction received — original record preserved", "edit");
  },

  openEvidence: (evidenceId) => set({ evidenceId }),
  closeEvidence: () => set({ evidenceId: null }),
  openCorrection: (correctionId) => set({ correctionId }),
  closeCorrection: () => set({ correctionId: null }),

  fetchLiveEvents: async (patientId: string) => {
    if (!patientId) return;
    try {
      const res = await fetch(
        `/api/timeline?patient_id=${encodeURIComponent(patientId)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.events && Array.isArray(data.events) && data.events.length > 0) {
        const mappedEvents: TimelineEvent[] = data.events.map(
          (e: {
            id: string;
            category: string;
            title: string;
            summary: string;
            timestamp: string;
            source: string;
            verified: boolean;
          }) => ({
            id: e.id,
            type: (e.category as EventType) || "symptom",
            title: e.title,
            when: new Date(e.timestamp).toLocaleDateString(),
            ts: new Date(e.timestamp).getTime(),
            desc: e.summary,
            src:
              e.source === "clinician_entry"
                ? "gp"
                : e.source === "ai_extracted"
                  ? "ai_note"
                  : "self",
            status: e.verified ? "verified" : "reported",
          }),
        );
        set({ events: mappedEvents });
      }
    } catch {
      // Retain existing state if live fetch fails
    }
  },
}));

/** Convenience selector: find an event by id. */
export const selectEventById =
  (id: string | null | undefined) => (s: { events: TimelineEvent[] }) =>
    id ? s.events.find((e) => e.id === id) : undefined;

export type { ProvenanceSource };
