import { expect, it } from "vitest";
import {
  SilenceDetector,
  wavFromSamples,
} from "@/features/ai-chat/speech/recording";
import { validateRecording } from "@/features/ai-chat/speech/server";

it("stops after five seconds of inactivity, but resets the timer for audio activity", () => {
  const detector = new SilenceDetector(1000);
  expect(detector.shouldStop(5999)).toBe(false);
  detector.push(new Float32Array(8000).fill(0.2), 5000, 16000);
  expect(detector.heardSpeech).toBe(true);
  expect(detector.shouldStop(9999)).toBe(false);
  expect(detector.shouldStop(10000)).toBe(true);
  expect(detector.shouldStop(61000)).toBe(true);
});
it("does not treat quiet recordings as speech and emits bounded mono WAV", () => {
  const detector = new SilenceDetector(0);
  detector.push(new Float32Array(48000), 1000, 48000);
  expect(detector.heardSpeech).toBe(false);
  const wav = new Uint8Array(wavFromSamples([new Float32Array(48000)], 48000));
  expect(wav.byteLength).toBe(32044);
  expect(validateRecording(wav)).toEqual({ silent: true, durationSeconds: 1 });
});
it("resamples, bounds recordings to 60 seconds, and rejects forged or oversized WAV", () => {
  const input = new Float32Array(16000 * 61).fill(0.1);
  const wav = new Uint8Array(wavFromSamples([input], 16000));
  expect(validateRecording(wav)).toEqual({
    silent: false,
    durationSeconds: 60,
  });
  const corrupt = wav.slice();
  corrupt[24] = 0;
  expect(() => validateRecording(corrupt)).toThrow("VALIDATION_FAILED");
  expect(() => validateRecording(new Uint8Array([1, 2, 3]))).toThrow(
    "VALIDATION_FAILED",
  );
});
