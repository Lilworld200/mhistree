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

interface ClinicianState {
  notes: ClinicianNote[];
  consultFeed: ConsultEntry[];
  addNote: (text: string) => void;
  askPatient: (q: string) => Promise<void>;
  resetConsultFeed: () => void;
}

export const useClinicianStore = create<ClinicianState>((set, get) => ({
  notes: [],
  consultFeed: [
    {
      q: null,
      a: "Mhistree Clinical AI Engine active · Connected to Longitudinal EHR. Ask any clinical question, summarize timeline events, or analyze symptoms.",
    },
  ],

  addNote(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    set({
      notes: [
        { id: "n" + Date.now(), text: trimmed, by: "Clinician", at: "Today" },
        ...get().notes,
      ],
    });
    toast("Note committed as clinician-authored fact", "check");
  },

  async askPatient(q) {
    const question = q.trim();
    if (!question) return;

    set({
      consultFeed: [
        ...get().consultFeed,
        {
          q: question,
          a: "Consulting Mhistree AI clinical reasoning engine...",
        },
      ],
    });

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: question }],
        }),
      });

      if (!res.ok) throw new Error("AI request failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let answer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") break;
              try {
                const parsed = JSON.parse(dataStr);
                if (parsed.delta) {
                  answer += parsed.delta;
                  const currentFeed = [...get().consultFeed];
                  currentFeed[currentFeed.length - 1] = {
                    q: question,
                    a: answer,
                  };
                  set({ consultFeed: currentFeed });
                }
              } catch {
                // Ignore non-JSON SSE lines
              }
            }
          }
        }
      }
    } catch {
      const currentFeed = [...get().consultFeed];
      currentFeed[currentFeed.length - 1] = {
        q: question,
        a: "Unable to connect to AI gateway. Please verify your environment key settings.",
      };
      set({ consultFeed: currentFeed });
    }
  },

  resetConsultFeed: () => set({ consultFeed: [] }),
}));
