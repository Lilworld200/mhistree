"use client";
import { useEffect, useRef, useState } from "react";
import {
  audioBase64,
  startMicrophone,
  type MicrophoneSession,
} from "./recording";
import type { TranscriptDraft } from "./schema";

const accessErrors = new Set([
  "AUTH_REQUIRED",
  "SESSION_RETIRED",
  "ACCESS_DENIED",
  "ACCESS_REVOKED",
]);
export function useVoiceChat(
  onTranscript: (draft: TranscriptDraft) => void,
  onSessionLost: () => void,
) {
  const callbacks = useRef({ onTranscript, onSessionLost });
  useEffect(() => {
    callbacks.current = { onTranscript, onSessionLost };
  });
  const [enabled, setEnabled] = useState(false);
  const [recording, setRecording] = useState<
    "idle" | "starting" | "recording" | "transcribing"
  >("idle");
  const [error, setError] = useState("");
  const [inputLevel, setInputLevel] = useState(0);
  const [playback, setPlayback] = useState<
    "idle" | "loading" | "playing" | "ready"
  >("idle");
  const [replyId, setReplyId] = useState("");
  const recorder = useRef<MicrophoneSession | null>(null);
  const capture = useRef<AbortController | null>(null);
  const speech = useRef<AbortController | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const cache = useRef(new Map<string, string>());
  const selectedReply = useRef("");
  const active = useRef(true);
  function failure(cause: unknown, fallback: string) {
    if (!active.current) return;
    const code = cause instanceof Error ? cause.message : "";
    if (accessErrors.has(code)) {
      reset();
      setEnabled(false);
      callbacks.current.onSessionLost();
      return;
    }
    setError(
      code === "RATE_LIMITED"
        ? "Speech usage is temporarily limited. You can keep chatting by text."
        : fallback,
    );
  }
  // These resource cleanup methods must keep their identity across renders.
  const [{ stopPlayback, cancelRecording, reset }] = useState(() => {
    const stopPlayback = () => {
      speech.current?.abort();
      speech.current = null;
      player.current?.pause();
      player.current = null;
      if (active.current) setPlayback(selectedReply.current ? "ready" : "idle");
    };
    const cancelRecording = () => {
      capture.current?.abort();
      capture.current = null;
      recorder.current?.cancel();
      recorder.current = null;
      if (active.current) {
        setRecording("idle");
        setInputLevel(0);
      }
    };
    const reset = () => {
      cancelRecording();
      stopPlayback();
      cache.current.forEach((url) => URL.revokeObjectURL(url));
      cache.current.clear();
      selectedReply.current = "";
      if (active.current) {
        setReplyId("");
        setPlayback("idle");
        setError("");
      }
    };
    return { stopPlayback, cancelRecording, reset };
  });
  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void fetch("/api/chat/speech", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (active.current && !controller.signal.aborted)
          setEnabled(result.ok && result.data?.enabled === true);
      })
      .catch(() => {});
    const hide = () => {
      if (document.hidden) {
        cancelRecording();
        stopPlayback();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      active.current = false;
      controller.abort();
      reset();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [reset, cancelRecording, stopPlayback]);
  async function beginRecording() {
    if (!enabled || capture.current) return;
    stopPlayback();
    setError("");
    setRecording("starting");
    setInputLevel(0);
    const controller = new AbortController();
    capture.current = controller;
    try {
      recorder.current = await startMicrophone(
        async (wav) => {
          recorder.current = null;
          if (controller.signal.aborted || !active.current) return;
          if (!wav) {
            capture.current = null;
            setRecording("idle");
            setError("No speech was detected. Try again or type your message.");
            return;
          }
          setRecording("transcribing");
          try {
            const response = await fetch("/api/chat/speech", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                action: "transcribe",
                base64: audioBase64(wav),
              }),
              signal: controller.signal,
            });
            const result = await response.json();
            if (!result.ok) throw new Error(result.error?.code);
            if (!controller.signal.aborted && active.current) {
              if (result.data.text?.trim())
                callbacks.current.onTranscript(result.data);
              else
                setError(
                  "No speech was detected. Try again or type your message.",
                );
            }
          } catch (cause) {
            if (!controller.signal.aborted)
              failure(
                cause,
                "Speech couldn't be transcribed. Please try again or type your message.",
              );
          } finally {
            if (capture.current === controller) capture.current = null;
            if (!controller.signal.aborted && active.current)
              setRecording("idle");
          }
        },
        (message) => {
          if (!controller.signal.aborted && active.current) {
            capture.current = null;
            setError(message);
            setRecording("idle");
          }
        },
        controller.signal,
        (level) => {
          if (!controller.signal.aborted && active.current) setInputLevel(level);
        },
      );
      if (controller.signal.aborted) {
        recorder.current.cancel();
        recorder.current = null;
        return;
      }
      setRecording("recording");
    } catch (cause) {
      if (!controller.signal.aborted && active.current) {
        capture.current = null;
        setRecording("idle");
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Microphone access wasn't allowed. You can enable it in browser settings or type instead."
            : cause instanceof Error
              ? cause.message
              : "Microphone unavailable. Please type your message.",
        );
      }
    }
  }
  async function play(id: string) {
    if (!enabled || !active.current) return;
    stopPlayback();
    selectedReply.current = id;
    setReplyId(id);
    setError("");
    setPlayback("loading");
    const controller = new AbortController();
    speech.current = controller;
    try {
      // Even cached playback checks the current session; no cross-session or persistent audio cache.
      if (cache.current.has(id)) {
        const check = await fetch(
          `/api/chat/speech?messageId=${encodeURIComponent(id)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const result = await check.json();
        if (!result.ok || !result.data.enabled)
          throw new Error(result.error?.code ?? "ACCESS_DENIED");
      } else {
        const response = await fetch("/api/chat/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ action: "synthesize", messageId: id }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error?.code);
        }
        if (response.headers.get("content-type") !== "audio/wav")
          throw new Error("PROVIDER_UNAVAILABLE");
        const blob = await response.blob();
        if (controller.signal.aborted || !active.current) return;
        if (cache.current.size >= 5) {
          const first = cache.current.entries().next().value;
          if (first) {
            URL.revokeObjectURL(first[1]);
            cache.current.delete(first[0]);
          }
        }
        cache.current.set(id, URL.createObjectURL(blob));
      }
      if (controller.signal.aborted || !active.current) return;
      const audio = new Audio(cache.current.get(id));
      player.current = audio;
      audio.onended = () => {
        if (active.current && player.current === audio) setPlayback("ready");
      };
      audio.onerror = () => {
        if (active.current && player.current === audio) {
          setPlayback("ready");
          setError(
            "Audio couldn't play. Your written reply is still available.",
          );
        }
      };
      try {
        await audio.play();
      } catch {
        if (!controller.signal.aborted && active.current) {
          setPlayback("ready");
          setError("Tap Play reply to hear the response.");
        }
        return;
      }
      if (controller.signal.aborted || !active.current) {
        audio.pause();
        return;
      }
      setPlayback("playing");
    } catch (cause) {
      if (!controller.signal.aborted && active.current) {
        setPlayback("ready");
        failure(
          cause,
          "Read-aloud is unavailable. Your written reply is still available; you can retry playback.",
        );
      }
    }
  }
  return {
    enabled,
    recording,
    inputLevel: recording === "recording" ? inputLevel : 0,
    error,
    playback,
    replyId,
    beginRecording,
    stopRecording: () => recorder.current?.stop(),
    cancelRecording,
    stopPlayback,
    play,
    reset,
  };
}
