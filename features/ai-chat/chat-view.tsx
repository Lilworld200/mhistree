"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Btn, IconBtn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { ExtractionStatus } from "./extraction/status-view";
import { notifyRecordsChanged } from "@/features/health-records/record-updates";
import { Icon, Logo } from "@/components/ui/icons";
import { useChatNavigation } from "@/components/layout/chat-navigation";
import { useVoiceChat } from "./speech/use-voice-chat";
import { RecordingControls } from "./speech/recording-controls";
import type { TranscriptDraft } from "./speech/schema";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";

import type { Conversation } from "./conversation";

type Message = {
  id: string;
  role: string;
  content: string;
  captured_at: string;
  timezone: string;
  state: string | null;
  sequence: string;
  reply_to?: string;
  replyInputMethod?: "text" | "microphone";
  inputMethod?: "text" | "microphone";
  transcription?: { text: string; model: string; capturedAt: string } | null;
};
type History = {
  items: Message[];
  nextCursor: string | null;
  memoryReady?: boolean;
};
export function ChatView() {
  const router = useRouter();
  const chatNavigation = useChatNavigation();
  const requested = chatNavigation?.requested;
  const setNavigation = chatNavigation?.setNavigation;
  const initialRequest = useRef(requested);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]),
    [selected, setSelected] = useState(""),
    [history, setHistory] = useState<History>({ items: [], nextCursor: null }),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [generating, setGenerating] = useState(""),
    [processing, setProcessing] = useState(0),
    [processingError, setProcessingError] = useState(""),
    [processingRevision, setProcessingRevision] = useState(0);
  const [memoryState, setMemoryState] = useState<"" | "preparing" | "failed">(
    "",
  );
  const preparation = useRef<{ id: string; promise: Promise<void> } | null>(
    null,
  );
  const limitedMemory = useRef(new Set<string>());
  const naming = useRef(new Set<string>());
  const created = useRef(new Set<string>());
  const [voiceDraft, setVoiceDraft] = useState<TranscriptDraft | null>(null);
  const voice = useVoiceChat(
    (draft) => {
      setVoiceDraft(draft);
      setText((previous) =>
        previous ? `${previous}\n${draft.text}` : draft.text,
      );
      document.getElementById("chat-message")?.focus();
    },
    () => {
      setVoiceDraft(null);
      setText("");
      setHistory({ items: [], nextCursor: null });
      setError(
        "Your session or speech access ended. Please sign in again if needed.",
      );
    },
  );
  const resetVoice = voice.reset;
  const request = useRef<{ key: string; text: string; token?: string } | null>(
      null,
    ),
    locked = useRef(false),
    current = useRef("");
  const startPreparation = useCallback(function startPreparation(
    id: string,
    previousConversationId?: string,
    create = false,
  ) {
    if (preparation.current?.id === id) return preparation.current.promise;
    setMemoryState("preparing");
    const promise = (async () => {
      if (create) {
        await api("/api/chat", {
          action: "create",
          data: {
            id,
            ...(previousConversationId ? { previousConversationId } : {}),
          },
        });
        created.current.add(id);
        void api<Conversation[]>("/api/chat")
          .then(setConversations)
          .catch(() => {});
      }
      for (;;) {
        if (current.current !== id) return;
        const result = await api<{ state: string }>("/api/chat", {
          action: "prepare-memory",
          data: { id },
        });
        if (result.state === "ready") break;
        if (!["pending", "running"].includes(result.state))
          throw new Error("PROVIDER_UNAVAILABLE");
        if (result.state === "running")
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (current.current === id) setMemoryState("");
    })().catch((e) => {
      if (current.current === id) {
        if (
          e instanceof Error &&
          [
            "AUTH_REQUIRED",
            "SESSION_RETIRED",
            "ACCESS_DENIED",
            "ACCESS_REVOKED",
          ].includes(e.message)
        ) {
          setHistory({ items: [], nextCursor: null });
          setConversations([]);
          setMemoryState("");
          setError(errorMessage(e));
        } else setMemoryState("failed");
      }
      throw e;
    });
    preparation.current = { id, promise };
    return promise;
  }, []);
  const load = useCallback(
    async (id: string) => {
      const result = await api<History>(`/api/chat?id=${id}`);
      if (current.current === id) {
        setHistory(result);
        if (
          result.memoryReady === false &&
          preparation.current?.id !== id &&
          !limitedMemory.current.has(id)
        )
          void startPreparation(id).catch(() => {});
        if (
          result.items.filter((m) => m.role === "patient").length >= 2 &&
          !naming.current.has(id)
        ) {
          naming.current.add(id);
          void api("/api/chat", { action: "title", data: { id } })
            .then(() => api<Conversation[]>("/api/chat"))
            .then(setConversations)
            .catch(() => {
              naming.current.delete(id);
            });
        }
      }
      return result;
    },
    [startPreparation],
  );
  useEffect(() => {
    void api<Conversation[]>("/api/chat")
      .then((items) => {
        setConversations(items);
        if (items[0] && !initialRequest.current) {
          current.current = items[0].id;
          setSelected(items[0].id);
          void load(items[0].id).catch((e) => setError(errorMessage(e)));
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, [load]);
  useEffect(() => {
    setNavigation?.({
      conversations,
      selected,
      busy: busy || Boolean(generating),
    });
  }, [conversations, selected, busy, generating, setNavigation]);
  useEffect(() => {
    if (!requested) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      current.current = requested.id;
      setSelected(requested.id);
      setError("");
      setMemoryState("");
      preparation.current = null;
      request.current = null;
      resetVoice();
      setVoiceDraft(null);
      setText("");
      setHistory({ items: [], nextCursor: null });
      if (requested.newConversation) {
        void startPreparation(
          requested.id,
          requested.previousConversationId,
          true,
        ).catch(() => {});
      } else if (requested.id) {
        void load(requested.id).catch((e) => setError(errorMessage(e)));
      }
    });
    return () => {
      active = false;
    };
  }, [requested, resetVoice, load, startPreparation]);
  useEffect(() => {
    const area = scrollRef.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [history.items.length, generating]);
  async function generate(id: string, conversation: string, readAloud = false) {
    setGenerating(id);
    setError("");
    let succeeded = false;
    try {
      await api("/api/chat", {
        action: "generate",
        data: {
          id,
          ...(limitedMemory.current.has(conversation)
            ? { continueWithoutMemory: true }
            : {}),
        },
      });
      succeeded = true;
    } catch (e) {
      setError(
        e instanceof Error &&
          ["PROVIDER_UNAVAILABLE", "RATE_LIMITED"].includes(e.message)
          ? "The AI could not finish this reply. Your message is saved. Use Retry reply to try again."
          : errorMessage(e),
      );
    } finally {
      setGenerating("");
      const page = await load(conversation).catch((e) => {
        setError(errorMessage(e));
        return null;
      });
      if (succeeded && readAloud && page && current.current === conversation) {
        const reply = page.items.find(
          (m) => m.role === "assistant" && m.reply_to === id,
        );
        if (reply) void voice.play(reply.id);
      }
    }
  }
  async function processReport(messageId: string) {
    setProcessing((count) => count + 1);
    setProcessingError("");
    try {
      const result = await api<{ state: string }>("/api/extraction", {
        messageId,
      });
      if (["succeeded", "partial", "held"].includes(result.state))
        notifyRecordsChanged();
      if (["partial", "held", "failed"].includes(result.state))
        setProcessingError(
          result.state === "held"
            ? "Your message is saved. Some report details need clarification or review before they can appear in your timeline. Open Report processing below."
            : "Your message is saved, but timeline processing is incomplete. Some details may already be recorded. Open Report processing below to review or retry.",
        );
    } catch {
      setProcessingError(
        "Your message is saved, but record processing needs a retry. Open Report processing below.",
      );
    } finally {
      setProcessing((count) => count - 1);
      setProcessingRevision((value) => value + 1);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (
      locked.current ||
      generating ||
      voice.recording !== "idle" ||
      !text.trim()
    )
      return;
    voice.stopPlayback();
    const spoken = voiceDraft;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      let id = selected;
      if (!id) {
        id = crypto.randomUUID();
        await api("/api/chat", { action: "create", data: { id } });
        current.current = id;
        setSelected(id);
        setConversations(await api("/api/chat"));
      }
      if (
        requested?.id === id &&
        requested.newConversation &&
        !created.current.has(id)
      ) {
        await api("/api/chat", {
          action: "create",
          data: {
            id,
            ...(requested.previousConversationId
              ? { previousConversationId: requested.previousConversationId }
              : {}),
          },
        });
        created.current.add(id);
      }
      if (preparation.current?.id === id && !limitedMemory.current.has(id)) {
        await preparation.current.promise;
        // Navigation during preparation must not send the captured draft to another conversation.
        if (current.current !== id) return;
      }
      if (
        !request.current ||
        request.current.text !== text ||
        request.current.token !== spoken?.token
      )
        request.current = {
          key: crypto.randomUUID(),
          text,
          token: spoken?.token,
        };
      const result = await api<{ messageId: string }>("/api/chat", {
        action: "send",
        data: {
          conversationId: id,
          requestKey: request.current.key,
          content: text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          ...(spoken
            ? { inputMethod: "microphone", transcriptionToken: spoken.token }
            : {}),
        },
      });
      setText("");
      setVoiceDraft(null);
      request.current = null;
      void api<Conversation[]>("/api/chat")
        .then(setConversations)
        .catch(() => {});
      // A display refresh must not prevent a saved message from receiving a reply.
      await load(id).catch(() => {});
      // Extraction is durable and independently retryable; it must never gate a reply.
      void processReport(result.messageId);
      await generate(result.messageId, id, Boolean(spoken));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
      locked.current = false;
    }
  }
  return (
    <section className="pagecol restored-chat">
      <MobileTopbarActions>
        <IconBtn
          ghost
          icon="bell"
          size={44}
          title="Notifications unavailable"
          disabled
        />
      </MobileTopbarActions>
      <header className="chead">
        <div>
          <h1 className="ctitle">Conversation</h1>
          <p className="csub">Your health story, kept together</p>
        </div>
        <div className="chat-header-actions">
          <IconBtn
            ghost
            icon="bell"
            size={40}
            title="Notifications unavailable"
            disabled
          />
        </div>
      </header>
      <div
        className="msgs"
        ref={scrollRef}
        aria-label="Conversation history"
        aria-busy={busy}
      >
        {history.nextCursor && (
          <Btn
            sm
            disabled={busy || Boolean(generating)}
            onClick={async () => {
              try {
                const older = await api<History>(
                  `/api/chat?id=${selected}&before=${history.nextCursor}`,
                );
                setHistory({
                  items: [...older.items, ...history.items],
                  nextCursor: older.nextCursor,
                });
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            Earlier messages
          </Btn>
        )}
        {!history.items.length && (
          <div className="empty">
            <div>
              <Logo s={44} />
              <h2 className="display-sm display">
                How can I help with
                <br />
                your health today?
              </h2>
              <p className="esub">
                Tell me what you’re experiencing, ask about your health history,
                or just talk normally.
              </p>
              <div className="qrow">
                <Btn
                  sm
                  icon="chat"
                  onClick={() => {
                    document.getElementById("chat-message")?.focus();
                  }}
                >
                  Describe how you feel
                </Btn>
                <Btn sm icon="heart" asChild>
                  <Link href="/health">Review my health</Link>
                </Btn>
                <Btn sm icon="doc" asChild>
                  <Link href="/documents">Add a document</Link>
                </Btn>
              </div>
            </div>
          </div>
        )}
        {history.items.map((m, index) => (
          <div key={m.id}>
            {index > 0 &&
              new Date(m.captured_at).getTime() -
                new Date(history.items[index - 1].captured_at).getTime() >
                3600000 && (
                <p className="conversation-gap">
                  Conversation resumed after a gap
                </p>
              )}
            <article
              className={`brow ${m.role === "patient" ? "brow-user" : "brow-ai"}`}
              id={`message-${m.id}`}
            >
              {m.role !== "patient" && (
                <span className="aav">
                  <Logo s={22} />
                </span>
              )}
              <div
                className={`bubble${m.role === "patient" ? " bubble-user" : ""}`}
              >
                <span className="sr-only">
                  {m.role === "patient" ? "You" : "Mhistree AI interpretation"}
                </span>
                <p className="message-content">{m.content}</p>
                {m.role === "assistant" &&
                  (m.replyInputMethod === "microphone" ||
                    history.items.some(
                      (p) =>
                        p.id === m.reply_to && p.inputMethod === "microphone",
                    )) && (
                    <Btn
                      sm
                      className="chat-reply-playback"
                      disabled={
                        voice.recording !== "idle" ||
                        voice.playback === "loading"
                      }
                      onClick={() => void voice.play(m.id)}
                    >
                      Play reply
                    </Btn>
                  )}
                <details className="message-meta">
                  <summary>
                    {m.role === "patient"
                      ? "Message details"
                      : "AI interpretation · details"}
                  </summary>
                  <small>
                    {new Date(m.captured_at).toLocaleString()} · captured in{" "}
                    {m.timezone}
                    {m.inputMethod === "microphone" &&
                      " · Microphone transcript reviewed before sending"}
                  </small>
                  {m.transcription && (
                    <p className="muted">
                      Original machine transcript: {m.transcription.text}
                    </p>
                  )}
                </details>
                {m.state && m.state !== "succeeded" && (
                  <p className="message-status">
                    Reply: {m.state}{" "}
                    {m.state === "failed" && generating !== m.id && (
                      <Btn
                        sm
                        disabled={Boolean(generating)}
                        onClick={() =>
                          void generate(
                            m.id,
                            selected,
                            m.inputMethod === "microphone",
                          )
                        }
                      >
                        Retry reply
                      </Btn>
                    )}
                  </p>
                )}
              </div>
            </article>
          </div>
        ))}
        {generating && (
          <div className="brow brow-ai" role="status">
            <span className="aav">
              <Logo s={22} />
            </span>
            <div className="bubble">
              <span className="tdots" aria-label="Generating reply">
                <i />
                <i />
                <i />
              </span>
              <Btn
                sm
                onClick={async () => {
                  try {
                    await api("/api/chat", {
                      action: "cancel",
                      data: { id: generating },
                    });
                    await load(selected);
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                }}
              >
                Cancel reply
              </Btn>
            </div>
          </div>
        )}
        {error && (
          <p className="ui-notice" role="alert">
            {error}
          </p>
        )}
        {processing > 0 && (
          <p className="muted" role="status">
            Updating your health record in parallel…
          </p>
        )}
        {processingError && (
          <p className="ui-notice" role="alert">
            {processingError}
          </p>
        )}
        <details className="processing-disclosure">
          <summary>Report processing</summary>
          <ExtractionStatus
            revision={history.items.length + processingRevision}
          />
        </details>
      </div>
      <div className="chat-speech-controls" aria-label="Voice message controls">
        {voiceDraft && (
          <div>
            <p className="muted" role="status">
              Review your transcript below, especially medicine names and doses,
              then press Send. Your reply will be read aloud.
            </p>
            <Btn
              sm
              onClick={() => {
                setVoiceDraft(null);
                request.current = null;
              }}
            >
              Use as typed message
            </Btn>
          </div>
        )}
        {voice.replyId && (
          <div>
            <span role="status">
              {voice.playback === "loading"
                ? "Preparing spoken reply…"
                : voice.playback === "playing"
                  ? "Reading reply aloud…"
                  : "Spoken reply ready"}
            </span>
            {voice.playback === "playing" || voice.playback === "loading" ? (
              <Btn sm onClick={voice.stopPlayback}>
                Stop playback
              </Btn>
            ) : (
              <Btn
                sm
                disabled={voice.recording !== "idle"}
                onClick={() => void voice.play(voice.replyId)}
              >
                Play reply
              </Btn>
            )}
          </div>
        )}
        {voice.error && (
          <p role="status" className="ui-notice">
            {voice.error}
          </p>
        )}
      </div>
      {memoryState === "preparing" && (
        <p className="muted" role="status">
          Remembering your earlier conversation… You can keep typing.
        </p>
      )}
      {memoryState === "failed" && (
        <div className="ui-notice" role="alert">
          <p>
            Earlier conversation memory could not finish preparing. Your draft
            is still here.
          </p>
          <Btn
            sm
            onClick={() => {
              const previous =
                requested?.id === selected
                  ? requested.previousConversationId
                  : undefined;
              preparation.current = null;
              void startPreparation(
                selected,
                previous,
                Boolean(
                  requested?.id === selected && requested.newConversation,
                ),
              ).catch(() => {});
            }}
          >
            Retry memory preparation
          </Btn>
          <Btn
            sm
            onClick={() => {
              limitedMemory.current.add(selected);
              setMemoryState("");
            }}
          >
            Continue with existing memory
          </Btn>
        </div>
      )}
      <form onSubmit={send} className="composer">
        <IconBtn
          icon="clip"
          size={44}
          title="Attach a document"
          onClick={() => router.push("/documents")}
        />
        {voice.recording !== "idle" ? (
          <RecordingControls
            state={voice.recording}
            level={voice.inputLevel}
            onStop={voice.stopRecording}
            onCancel={voice.cancelRecording}
          />
        ) : <IconBtn
          icon="mic"
          size={44}
          title={
            voice.enabled
              ? "Record a voice message"
              : "Voice messages unavailable"
          }
          disabled={
            !voice.enabled ||
            busy ||
            Boolean(generating) ||
            voice.recording !== "idle" ||
            Boolean(voiceDraft)
          }
          onClick={() => void voice.beginRecording()}
        />}
        <label className="sr-only" htmlFor="chat-message">
          Message Mhistree
        </label>
        <textarea
          id="chat-message"
          className="cinput"
          name="message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={10000}
          rows={1}
          required
          placeholder={busy ? "Replying…" : "Message…"}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="btn btn-dark send"
          type="submit"
          aria-label="Send message"
          disabled={
            busy ||
            Boolean(generating) ||
            voice.recording !== "idle" ||
            !text.trim()
          }
        >
          <Icon n="up" s={17} />
        </button>
      </form>
    </section>
  );
}
