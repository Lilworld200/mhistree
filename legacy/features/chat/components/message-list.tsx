"use client";

import { motion } from "motion/react";
import { Btn } from "@/components/ui/button";
import { Logo } from "@/components/ui/icons";
import { useRouter } from "next/navigation";
import { MessageBubble } from "./message-bubble";
import { useChatStore } from "../store";
import type { ChatMessage } from "../types";

export function ChatEmptyState() {
  const router = useRouter();
  return (
    <div className="empty">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Logo s={44} />
        <h1 className="display-sm display">
          How can I help with
          <br />
          your health today?
        </h1>
        <p className="esub">
          Tell me what you’re experiencing, ask about your health history, or just
          talk normally.
        </p>
        <div className="qrow">
          <Btn
            kind="soft"
            sm
            icon="chat"
            onClick={() =>
              useChatStore.getState().send("I feel a bit tired and had a headache since evening")
            }
          >
            Describe how you feel
          </Btn>
          <Btn kind="soft" sm icon="heart" onClick={() => router.push("/health")}>
            Review my health
          </Btn>
          <Btn kind="soft" sm icon="doc" onClick={() => router.push("/documents")}>
            Add a document
          </Btn>
        </div>
      </motion.div>
    </div>
  );
}

export function MessageList({
  messages,
  typing,
}: {
  messages: ChatMessage[];
  typing: boolean;
}) {
  return (
    <>
      {messages.map((m, i) => (
        <MessageBubble key={m.id} m={m} last={i === messages.length - 1} />
      ))}
      {typing && (
        <div className="brow brow-ai">
          <span className="aav">
            <Logo s={22} />
          </span>
          <div className="bubble">
            <span className="tdots" aria-label="Mhistree is typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      )}
    </>
  );
}
