import { create } from "zustand";

export type AssistantContext = "health" | "patient" | "document" | "conversation";

interface AiAssistantState {
  /** Open drawer bound to a context; null = closed. */
  context: AssistantContext | null;
  open: (ctx: AssistantContext) => void;
  close: () => void;
}

export const useAiAssistantStore = create<AiAssistantState>((set) => ({
  context: null,
  open: (context) => set({ context }),
  close: () => set({ context: null }),
}));
