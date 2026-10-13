import { toast } from "@/components/ui/toast-store";
import { create } from "zustand";
import { seedDocuments } from "./data/seed";
import type { DocumentRecord } from "./types";

const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

interface DocumentsState {
  documents: DocumentRecord[];
  viewId: string | null;
  uploading: boolean;

  upload: () => void;
  setViewId: (id: string | null) => void;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: seedDocuments,
  viewId: null,
  uploading: false,

  upload() {
    if (get().uploading) {
      toast("A document is already processing", "alert");
      return;
    }
    const id = "d" + Date.now();
    set({
      uploading: true,
      documents: [
        {
          id,
          name: "New upload — clinic receipt",
          type: "Document",
          date: "Today",
          facility: "Pending sync",
          extracted: [],
          linked: [],
          processing: true,
        },
        ...get().documents,
      ],
    });
    toast("Upload received · processing", "doc");

    // DEMO ADAPTER — simulated extraction pipeline.
    // Production: Supabase Storage upload → job row → worker → pgvector + ledger facts.
    pendingTimers.set(
      id,
      setTimeout(() => {
        pendingTimers.delete(id);
        set({
          uploading: false,
          documents: get().documents.map((d) =>
            d.id === id
              ? { ...d, processing: false, extracted: ["Visit date captured", "Facility: Central Clinic"] }
              : d,
          ),
        });
        toast("Extraction complete · 2 facts linked", "spark");
      }, 2200),
    );
  },

  setViewId: (viewId) => set({ viewId }),
}));
