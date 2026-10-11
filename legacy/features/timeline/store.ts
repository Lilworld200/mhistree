import { toast } from "@/components/ui/toast-store";
import { create } from "zustand";
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
  loading: boolean;
  error: string | null;

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
  events: [],
  episodes: [],
  typeFilter: "All",
  srcFilter: "All",
  evidenceId: null,
  correctionId: null,
  loading: false,
  error: null,

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

  verify: (id, by = "Clinician") => {
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
    set({ loading: true, error: null });
    try {
      const res = await fetch(
        `/api/timeline?patient_id=${encodeURIComponent(patientId)}`,
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error || `HTTP ${res.status} ${res.statusText}`;
        console.error("[Mhistree Timeline API Error]:", errMsg);
        set({ error: errMsg, events: [], loading: false });
        return;
      }
      const data = await res.json();
      if (data.events && Array.isArray(data.events)) {
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
            type: (e.category === "symptom"
              ? "Symptom"
              : e.category === "vitals"
                ? "Vital"
                : e.category === "medication"
                  ? "Medication"
                  : e.category === "lab"
                    ? "Lab"
                    : e.category === "clinical_note"
                      ? "Condition"
                      : "Symptom") as EventType,
            title: e.title,
            when: new Date(e.timestamp).toLocaleDateString(),
            ts: new Date(e.timestamp).getTime(),
            desc: e.summary,
            src: (e.source === "clinician_entry"
              ? "clinician"
              : e.source === "ai_extracted"
                ? "ai"
                : e.source === "device_sync"
                  ? "device"
                  : "self") as ProvenanceSource,
            status: e.verified ? "verified" : "reported",
          }),
        );
        set({ events: mappedEvents, error: null, loading: false });
      } else {
        set({ events: [], error: null, loading: false });
      }
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Timeline fetch error";
      console.error("[Mhistree Timeline Fetch Exception]:", err);
      set({ error: errMsg, events: [], loading: false });
    }
  },
}));

/** Convenience selector: find an event by id. */
export const selectEventById =
  (id: string | null | undefined) => (s: { events: TimelineEvent[] }) =>
    id ? s.events.find((e) => e.id === id) : undefined;

export type { ProvenanceSource };
