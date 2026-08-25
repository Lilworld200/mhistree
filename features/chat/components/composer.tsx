"use client";

import { IconBtn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { useRouter } from "next/navigation";
import { useChatStore } from "../store";

export function Composer({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const typing = useChatStore((s) => s.typing);
  const send = useChatStore((s) => s.send);
  const setDraft = useChatStore((s) => s.setDraft);
  const text = useChatStore((s) => s.drafts[sessionId] ?? "");
  const canSend = !!text.trim() && !typing;

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSend) return;
        send(text);
      }}
    >
      <IconBtn
        type="button"
        icon="clip"
        size={44}
        title="Attach document"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push("/documents");
        }}
      />
      <IconBtn
        type="button"
        icon="mic"
        size={44}
        title="Voice (after MVP)"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toast("Voice input arrives after MVP", "mic");
        }}
      />
      <input
        className="cinput"
        placeholder={typing ? "Mhistree is replying…" : "Message Mhistree…"}
        value={text}
        onChange={(e) => setDraft(sessionId, e.target.value)}
        aria-label="Message Mhistree"
      />
      <button
        type="submit"
        className="btn btn-dark send"
        aria-label="Send"
        disabled={!canSend}
      >
        <Icon n="up" s={17} />
      </button>
    </form>
  );
}
