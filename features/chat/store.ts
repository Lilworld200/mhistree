import { create } from "zustand";
import { GENERIC_REPLIES, REPLY_RULES, titleFromText } from "./data/reply-rules";
import { seedMessages, seedSessions } from "./data/seed";
import type { ChatMessage } from "./types";
import { useTimelineStore } from "@/features/timeline/store";

interface ChatState {
  sessions: typeof seedSessions;
  activeSessionId: string;
  messages: Record<string, ChatMessage[]>;
  typing: boolean;
  drafts: Record<string, string>;

  newChat: () => void;
  openSession: (id: string) => void;
  send: (text: string) => void;
  setDraft: (sessionId: string, text: string) => void;
}

const UNTITLED = "New conversation";

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: seedSessions,
  activeSessionId: "s1",
  messages: seedMessages,
  typing: false,
  drafts: {},

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
    const id = "s" + Date.now();
    set({
      sessions: [{ id, title: UNTITLED, group: "Today" }, ...s.sessions],
      messages: { ...s.messages, [id]: [] },
      activeSessionId: id,
    });
  },

  openSession(id) {
    set({ activeSessionId: id });
  },

  send(text) {
    const trimmed = text.trim();
    if (!trimmed || get().typing) return;

    const sid = get().activeSessionId;
    const userMsg: ChatMessage = { id: "m" + Date.now(), role: "user", text: trimmed };

    set((s) => ({
      messages: { ...s.messages, [sid]: [...(s.messages[sid] ?? []), userMsg] },
      sessions: s.sessions.map((x) =>
        x.id === sid && x.title === UNTITLED ? { ...x, title: titleFromText(trimmed) } : x,
      ),
      typing: true,
      drafts: { ...s.drafts, [sid]: "" },
    }));

    // DEMO ADAPTER latency — production path streams from /api/ai/chat.
    setTimeout(() => {
      const timeline = useTimelineStore.getState();
      const rule = REPLY_RULES.find((r) => r.re.test(trimmed));

      if (rule) {
        const evId = timeline.addReportedEvent({
          type: rule.type,
          title: rule.title,
          desc: trimmed,
          sessionId: sid,
        });
        pushMsg(set, get, sid, {
          id: "sy" + Date.now(),
          role: "sys",
          text: `Saved to your health timeline · ${rule.title} (reported)`,
          evId,
        });
        const prior = useTimelineStore
          .getState()
          .events.find((e) => e.title === rule.title && e.id !== evId);
        pushMsg(set, get, sid, {
          id: "ai" + Date.now(),
          role: "ai",
          mem: !!prior,
          fresh: true,
          text: rule.reply(prior),
        });
      } else {
        pushMsg(set, get, sid, {
          id: "ai" + Date.now(),
          role: "ai",
          fresh: true,
          text: GENERIC_REPLIES[Math.floor(Math.random() * GENERIC_REPLIES.length)],
        });
      }
      set({ typing: false });
    }, 1000);
  },

  setDraft(sessionId, text) {
    set((s) => ({ drafts: { ...s.drafts, [sessionId]: text } }));
  },
}));

function pushMsg(
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
  sid: string,
  m: ChatMessage,
) {
  const list = get().messages[sid] ?? [];
  set((s) => ({ messages: { ...s.messages, [sid]: [...list, m] } }));
}
