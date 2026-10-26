/* Same-origin worklet: streams mono samples locally; never contacts a service. */
class MhistreeRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.offset = 0;
    this.running = true;
    this.frames = 0;
    this.port.onmessage = ({ data }) => {
      if (data === "stop") {
        this.flush();
        this.running = false;
        this.port.postMessage("stopped");
      }
    };
  }
  flush() {
    if (this.offset) {
      const chunk = this.buffer.slice(0, this.offset);
      this.port.postMessage(chunk, [chunk.buffer]);
      this.offset = 0;
    }
  }
  process(inputs) {
    if (!this.running) return false;
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const remaining = Math.max(0, Math.floor(sampleRate * 60) - this.frames);
    const count = Math.min(remaining, channel.length);
    for (let i = 0; i < count; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.buffer.length) this.flush();
    }
    this.frames += count;
    if (this.frames >= sampleRate * 60) {
      this.flush();
      this.running = false;
      this.port.postMessage("limit");
      return false;
    }
    return true;
  }
}
registerProcessor("mhistree-recorder", MhistreeRecorder);
