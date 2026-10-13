"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { ChatHeader } from "./chat-header";
import { ChatEmptyState, MessageList } from "./message-list";
import { Composer } from "./composer";
import { useChatStore } from "../store";

export function ChatView() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const msgs = useChatStore((s) => s.messages[s.activeSessionId]) ?? [];
  const typing = useChatStore((s) => s.typing);

  const scrollRef = useRef<HTMLDivElement>(null);
  const session = sessions.find((s) => s.id === activeId);

  const fetchHistory = useChatStore((s) => s.fetchHistory);
  const loaded = useChatStore((s) => s.loaded);

  // Sync the signed-in member's persisted history once per tab session.
  useEffect(() => {
    if (loaded) return;

    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchHistory();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session) {
        fetchHistory();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loaded, fetchHistory]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs.length, typing]);

  // Keep the newest streamed text in view while the typewriter runs.
  useEffect(() => {
    if (!typing) return;
    const el = scrollRef.current;
    const t = setInterval(() => {
      if (el) el.scrollTop = el.scrollHeight;
    }, 250);
    return () => clearInterval(t);
  }, [typing]);

  return (
    <div className="pagecol">
      <ChatHeader title={session?.title || "Conversation"} />
      <div className="msgs" ref={scrollRef}>
        {msgs.length === 0 && <ChatEmptyState />}
        <MessageList messages={msgs} typing={typing} />
      </div>
      <Composer sessionId={activeId} />
    </div>
  );
}
