import { audioSampleRate, maxRecordingSeconds, silenceSeconds } from "./schema";

/** Audio activity detector. Ambient noise isn't proof of speech; an empty STT result is discarded too. */
export class SilenceDetector {
  private lastActive = 0;
  private activeFrames = 0;
  private noise = 0.003;
  constructor(private started: number) {
    this.lastActive = started;
  }
  push(samples: Float32Array, now: number, sampleRate: number) {
    const energy = Math.sqrt(
      samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
    );
    if (energy > Math.max(0.012, this.noise * 3)) {
      this.lastActive = now;
      this.activeFrames += samples.length / sampleRate;
      return Math.min(1, energy / 0.2);
    }
    this.noise = this.noise * 0.98 + Math.min(energy, 0.01) * 0.02;
    return 0;
  }
  get heardSpeech() {
    return this.activeFrames >= 0.15;
  }
  shouldStop(now: number) {
    return (
      now - this.lastActive >= silenceSeconds * 1000 ||
      now - this.started >= maxRecordingSeconds * 1000
    );
  }
}
export function wavFromSamples(chunks: Float32Array[], sourceRate: number) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const source = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const count = Math.min(
    audioSampleRate * maxRecordingSeconds,
    Math.floor((total * audioSampleRate) / sourceRate),
  );
  const buffer = new ArrayBuffer(44 + count * 2),
    view = new DataView(buffer);
  function ascii(at: number, s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  }
  ascii(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, audioSampleRate, true);
  view.setUint32(28, audioSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * sourceRate) / audioSampleRate),
      end = Math.max(
        start + 1,
        Math.floor(((i + 1) * sourceRate) / audioSampleRate),
      );
    let sum = 0;
    for (let j = start; j < end && j < source.length; j++) sum += source[j];
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, sample * (sample < 0 ? 32768 : 32767), true);
  }
  return buffer;
}
export type MicrophoneSession = { stop(): void; cancel(): void };
export async function startMicrophone(
  onDone: (wav: ArrayBuffer | null) => void,
  onError: (message: string) => void,
  signal: AbortSignal,
  onLevel?: (level: number) => void,
): Promise<MicrophoneSession> {
  if (
    !navigator.mediaDevices?.getUserMedia ||
    !globalThis.AudioContext ||
    !globalThis.AudioWorkletNode
  )
    throw new Error(
      "Microphone recording isn't supported here. You can still type your message.",
    );
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  if (signal.aborted) {
    stream.getTracks().forEach((t) => t.stop());
    throw new DOMException("Cancelled", "AbortError");
  }
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop());
    throw error;
  }
  let node: AudioWorkletNode | undefined,
    source: MediaStreamAudioSourceNode | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopTimeout: ReturnType<typeof setTimeout> | undefined;
  let chunks: Float32Array[] = [],
    finished = false,
    stopping = false;
  const detector = new SilenceDetector(performance.now());
  const cleanup = () => {
    clearInterval(timer);
    clearTimeout(stopTimeout);
    signal.removeEventListener("abort", cancel);
    stream.getTracks().forEach((t) => t.stop());
    source?.disconnect();
    if (node) {
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
    }
    void context.close().catch(() => {});
  };
  function cancel() {
    if (finished) return;
    finished = true;
    chunks = [];
    cleanup();
  }
  function finish() {
    if (finished) return;
    finished = true;
    const wav = detector.heardSpeech
      ? wavFromSamples(chunks, context.sampleRate)
      : null;
    chunks = [];
    cleanup();
    onDone(wav);
  }
  function stop() {
    if (finished || stopping) return;
    stopping = true;
    node?.port.postMessage("stop");
    stopTimeout = setTimeout(finish, 500);
    // Worklet acknowledgements drain the final samples before freeing the microphone.
  }
  try {
    await context.resume();
    await context.audioWorklet.addModule("/audio/mhistree-recorder.js");
    if (signal.aborted) {
      cancel();
      throw new DOMException("Cancelled", "AbortError");
    }
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, "mhistree-recorder");
    node.port.onmessage = ({ data }: MessageEvent<Float32Array | string>) => {
      if (finished) return;
      if (data === "stopped" || data === "limit") {
        finish();
        return;
      }
      if (data instanceof Float32Array) {
        chunks.push(data);
        const level = detector.push(data, performance.now(), context.sampleRate);
        onLevel?.(level);
      }
    };
    node.onprocessorerror = () => {
      cancel();
      onError(
        "Recording stopped unexpectedly. Please try again or type your message.",
      );
    };
    source.connect(node);
    node.connect(context.destination); // Worklet outputs silence; no microphone feedback.
    timer = setInterval(() => {
      if (detector.shouldStop(performance.now())) stop();
    }, 100);
    signal.addEventListener("abort", cancel, { once: true });
    return { stop, cancel };
  } catch (error) {
    cancel();
    throw error;
  }
}
export function audioBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
