import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ChatMessage, ChatSession } from "./types";

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string;
  messages: Record<string, ChatMessage[]>;
  typing: boolean;
  drafts: Record<string, string>;
  loaded: boolean;

  fetchHistory: (patientId?: string) => Promise<void>;
  newChat: () => void;
  openSession: (id: string) => void;
  send: (text: string) => Promise<void>;
  setDraft: (sessionId: string, text: string) => void;
}

const UNTITLED = "New conversation";

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: "",
      messages: {},
      typing: false,
      drafts: {},
      loaded: true,

      async fetchHistory(patientId?: string) {
        // If authenticated patientId provided, option to sync with Supabase history
        if (!patientId) return;
        try {
          const res = await fetch(
            `/api/ai/chat/history?patient_id=${encodeURIComponent(patientId)}`,
          );
          if (!res.ok) return;

          const data = await res.json();
          if (data.success) {
            const fetchedSessions: ChatSession[] = data.sessions || [];
            const fetchedMessages: Record<string, ChatMessage[]> =
              data.messages || {};

            const activeId =
              fetchedSessions.length > 0 ? fetchedSessions[0].id : "";

            set({
              sessions: fetchedSessions,
              messages: fetchedMessages,
              activeSessionId: get().activeSessionId || activeId,
              loaded: true,
            });
          }
        } catch (e) {
          console.error("[Chat History Fetch Error]:", e);
        }
      },

      newChat() {
        const s = get();
        // Reuse an existing empty session instead of stacking duplicates.
        const reusable = s.sessions.find(
          (x) => x.title === UNTITLED && (s.messages[x.id]?.length ?? 0) === 0,
        );
        if (reusable) {
          set({ activeSessionId: reusable.id });
          return;
        }
        const id = crypto.randomUUID();
        set({
          sessions: [{ id, title: UNTITLED, group: "Today" }, ...s.sessions],
          messages: { ...s.messages, [id]: [] },
          activeSessionId: id,
        });
      },

      openSession(id) {
        set({ activeSessionId: id });
      },

      async send(text) {
        const trimmed = text.trim();
        if (!trimmed || get().typing) return;

        let sid = get().activeSessionId;
        if (!sid) {
          sid = crypto.randomUUID();
          set({
            sessions: [
              { id: sid, title: titleFromText(trimmed), group: "Today" },
            ],
            messages: { [sid]: [] },
            activeSessionId: sid,
          });
        }

        const userMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "user",
          text: trimmed,
        };

        set((s) => ({
          messages: {
            ...s.messages,
            [sid]: [...(s.messages[sid] ?? []), userMsg],
          },
          sessions: s.sessions.map((x) =>
            x.id === sid && x.title === UNTITLED
              ? { ...x, title: titleFromText(trimmed) }
              : x,
          ),
          typing: true,
          drafts: { ...s.drafts, [sid]: "" },
        }));

        const sessionMessages = get().messages[sid] ?? [];
        const formattedMessages = sessionMessages.map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.text,
        }));

        try {
          const res = await fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: formattedMessages,
              sessionId: sid,
            }),
          });

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(
              errJson.error || `HTTP ${res.status} ${res.statusText}`,
            );
          }

          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let aiText = "";
          const aiMsgId = crypto.randomUUID();

          // Placeholder message for streaming assistant response
          pushMsg(set, get, sid, {
            id: aiMsgId,
            role: "ai",
            fresh: true,
            text: "",
          });

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
                    if (parsed.error) {
                      throw new Error(parsed.error);
                    }
                    if (parsed.delta) {
                      aiText += parsed.delta;
                      updateLastAiMsg(set, get, sid, aiMsgId, aiText);
                    }
                  } catch (e: unknown) {
                    if (e instanceof Error && e.message !== dataStr) {
                      console.error("[Chat Stream Parse Error]:", e);
                    }
                  }
                }
              }
            }
          }
        } catch (err: unknown) {
          const errMsg =
            err instanceof Error ? err.message : "AI model request failed";
          console.error("[Mhistree AI Chat Error]:", err);

          pushMsg(set, get, sid, {
            id: crypto.randomUUID(),
            role: "sys",
            text: `⚠️ Error communicating with AI: ${errMsg}. Check terminal console logs.`,
          });
        } finally {
          set({ typing: false });
        }
      },

      setDraft(sessionId, text) {
        set((s) => ({ drafts: { ...s.drafts, [sessionId]: text } }));
      },
    }),
    {
      name: "mhistree_chat_session_storage",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        messages: state.messages,
        drafts: state.drafts,
      }),
    },
  ),
);

function titleFromText(t: string) {
  const clean = t.replace(/[\n\r]+/g, " ").trim();
  if (clean.length <= 32) return clean;
  return clean.slice(0, 30) + "…";
}

function pushMsg(
  set: (
    partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  get: () => ChatState,
  sid: string,
  m: ChatMessage,
) {
  const list = get().messages[sid] ?? [];
  set((s) => ({ messages: { ...s.messages, [sid]: [...list, m] } }));
}

function updateLastAiMsg(
  set: (
    partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>),
  ) => void,
  get: () => ChatState,
  sid: string,
  msgId: string,
  newText: string,
) {
  const list = get().messages[sid] ?? [];
  const updated = list.map((m) =>
    m.id === msgId ? { ...m, text: newText } : m,
  );
  set((s) => ({ messages: { ...s.messages, [sid]: updated } }));
}
