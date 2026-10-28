"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import type { CareRecipient } from "./care-action-schema";
export type ConnectedMessage = {
  id: string;
  content: string;
  sent_at: string;
  sequence: string;
  role: string;
  name: string;
  connection_id: string;
  origin_conversation_id: string;
  summary_attachment?: { text: string };
  clinical_attachments?: { eventId: string; text: string }[];
};
type Snapshot = {
  recipients: CareRecipient[];
  online: string[];
  items: ConnectedMessage[];
};
export function useConnectedCare(conversationId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot>({
    recipients: [],
    online: [],
    items: [],
  });
  const [recipient, setRecipient] = useState<CareRecipient | null>(null),
    [error, setError] = useState("");
  const viewId = useRef<string>(crypto.randomUUID());
  const current = useRef(conversationId),
    serial = useRef(0),
    sending = useRef<{
      id: string;
      content: string;
      recipient: string;
      key: string;
      replyToMessageId?: string;
      timezone: string;
      transcriptionToken?: string;
    } | null>(null);
  const sync = useCallback(
    async (active = false) => {
      if (!conversationId) return;
      const result = await api<Snapshot>("/api/chat/connected-care", {
        action: "sync",
        conversationId,
        active,
        viewId: viewId.current,
      });
      if (
        !Array.isArray(result.recipients) ||
        !Array.isArray(result.online) ||
        !Array.isArray(result.items)
      )
        throw new Error("Care conversation unavailable.");
      if (current.current === conversationId) {
        setSnapshot(result);
        setError("");
      }
    },
    [conversationId],
  );
  useEffect(() => {
    current.current = conversationId;
    const generation = ++serial.current;
    const activeViewId = viewId.current;
    let running = false;
    const refresh = async (active = false) => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        await sync(active);
      } catch (e) {
        if (serial.current === generation) {
          setError(errorMessage(e));
          setSnapshot({ recipients: [], online: [], items: [] });
          setRecipient(null);
        }
      } finally {
        running = false;
      }
    };
    queueMicrotask(() => {
      setRecipient(null);
      setSnapshot({ recipients: [], online: [], items: [] });
      void refresh(true);
    });
    const timer = setInterval(() => void refresh(), 15000);
    const focus = () => {
      if (document.visibilityState === "visible") void refresh(true);
      else if (conversationId)
        void api("/api/chat/connected-care", {
          action: "sync",
          conversationId,
          hidden: true,
          viewId: activeViewId,
        }).catch(() => {});
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      if (conversationId)
        void api("/api/chat/connected-care", {
          action: "sync",
          conversationId,
          hidden: true,
          viewId: activeViewId,
        }).catch(() => {});
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [conversationId, sync]);
  function clearDeniedCare(cause: unknown) {
    if (
      cause instanceof Error &&
      [
        "ACCESS_DENIED",
        "ACCESS_REVOKED",
        "AUTH_REQUIRED",
        "SESSION_RETIRED",
      ].includes(cause.message)
    ) {
      setSnapshot({ recipients: [], online: [], items: [] });
      setRecipient(null);
    }
  }
  async function send(content: string, transcriptionToken?: string) {
    if (!recipient || !conversationId)
      throw new Error("Select a current care recipient.");
    if (
      !sending.current ||
      sending.current.content !== content ||
      sending.current.id !== conversationId ||
      sending.current.recipient !==
        `${recipient.connectionId}:${recipient.practitionerId}` ||
      sending.current.transcriptionToken !== transcriptionToken
    )
      sending.current = {
        id: conversationId,
        content,
        recipient: `${recipient.connectionId}:${recipient.practitionerId}`,
        replyToMessageId: snapshot.items.findLast(
          (m) => m.connection_id === recipient.connectionId,
        )?.id,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        transcriptionToken,
        key: crypto.randomUUID(),
      };
    try {
      const result = await api<Snapshot>("/api/chat/connected-care", {
        action: "send",
        conversationId,
        timezone: sending.current.timezone,
        viewId: viewId.current,
        replyToMessageId: sending.current.replyToMessageId,
        ...(sending.current.transcriptionToken
          ? { transcriptionToken: sending.current.transcriptionToken }
          : {}),
        requestKey: sending.current.key,
        content,
        recipient: {
          connectionId: recipient.connectionId,
          practitionerId: recipient.practitionerId,
          connectionRevision: recipient.revision,
        },
      });
      sending.current = null;
      if (current.current === conversationId) setSnapshot(result);
    } catch (cause) {
      clearDeniedCare(cause);
      throw cause;
    }
  }
  async function acknowledge() {
    if (!recipient || !conversationId) return;
    const last = snapshot.items.findLast(
      (m) => m.connection_id === recipient.connectionId,
    );
    if (!last) return;
    try {
      await api("/api/chat/connected-care", {
        action: "read",
        conversationId,
        recipient: {
          connectionId: recipient.connectionId,
          practitionerId: recipient.practitionerId,
          connectionRevision: recipient.revision,
        },
        throughSequence: last.sequence,
      });
      setError("");
    } catch (e) {
      clearDeniedCare(e);
      setError(errorMessage(e));
    }
  }
  return { snapshot, recipient, setRecipient, send, acknowledge, error };
}
