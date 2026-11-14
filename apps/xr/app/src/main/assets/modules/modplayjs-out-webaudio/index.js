// packages/out-webaudio/src/webaudio.ts
import { StateError } from "@modplayjs/core";
var RING_FRAMES = 65536;
var HIGH_WATER_FRAMES = RING_FRAMES / 2;
var CHUNK_FRAMES = 2048;
var COPY_HIGH_WATER_FRAMES = 8820;
var WebAudioOutput = class {
  name = "webaudio";
  core = null;
  ctx = null;
  node = null;
  renderTimer = null;
  running = false;
  paused = false;
  /** copy-mode pacing: frames handed to the worklet so far. */
  copyPostedFrames = 0;
  /** copy-mode backpressure: last reported worklet FIFO depth (frames). */
  copyDepth = 0;
  lastLoggedWrite = 0;
  /** Diagnostics for the demo status line (T22/T23). */
  debugInfo = { renderedFrames: 0, postedChunks: 0, copyDepth: 0 };
  /** Playback-clock tap: called after every successful pull with the
   * CUMULATIVE frames handed to the transport and the core whose state was
   * just advanced. `@modplayjs/playhead` turns these into the row that is
   * actually audible (the ring runs ~0.7 s ahead of the speaker). */
  onRender = null;
  /** Fired once when the module's playback reaches the end of the last
   * order (playBuffer returns -1 with an empty buffer). The transport has
   * been stopped by the time this fires; the player state remains. */
  onEnded = null;
  endedFired = false;
  /** Pending end-of-drain timeout (armed when playBuffer reports the
   * module's end). stop() cancels it: a programmatic stop must not fire
   * the queued onEnded as a ghost event. */
  drainTimer = null;
  /** Current transport ('sab' | 'copy') and AudioContext state. */
  get transportMode() {
    if (!this.running && this.node === null) return "idle";
    return this.header !== null ? "sab" : "copy";
  }
  get ctxState() {
    return this.ctx?.state ?? "no-context";
  }
  // sab ring state (main-thread side)
  header = null;
  ring = null;
  writePos = 0;
  // monotonic frames written
  renderScratch = null;
  // copy mode: last exact "frames left the worklet FIFO" observation and
  // when it was taken. Between 'depth' messages the count is extrapolated
  // at the device rate, so a UI querying at 60 fps sees a smooth counter
  // instead of a ~21 ms staircase.
  copyConsumedFrames = 0;
  copyConsumedAt = 0;
  /**
   * Frames that have LEFT the transport (i.e. reached the audio thread's
   * output, not the buffer). This is the counter a playback clock needs:
   * subtracting it from `debugInfo.renderedFrames` yields the render-ahead
   * backlog. SAB mode reads the worklet's read pointer directly (exact,
   * lock-free); copy mode uses the reported FIFO depth plus extrapolation.
   */
  get consumedFrames() {
    if (this.header !== null) {
      return Atomics.load(this.header, 1);
    }
    if (!this.running) return this.copyPostedFrames;
    if (this.paused) return this.copyConsumedFrames;
    const elapsed = this.now() - this.copyConsumedAt;
    const extra = elapsed * (this.ctx?.sampleRate ?? 44100) / 1e3;
    const extrapolated = this.copyConsumedFrames + Math.max(0, extra);
    const cap = this.copyPostedFrames;
    return extrapolated > cap ? cap : extrapolated;
  }
  /** Frames the device itself still holds after the worklet drained them
   * (AudioContext baseLatency + outputLatency). Small (a few to tens of ms)
   * but it is the difference between "handed to the device" and audibly
   * playing. */
  get deviceLatencyFrames() {
    const ctx = this.ctx;
    if (!ctx) return 0;
    const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
    const out = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
    return Math.max(0, Math.round((base + out) * ctx.sampleRate));
  }
  /** Frames audible right now = consumed − device latency. Feed this to
   * `Playhead.setConsumedProvider`. */
  get audibleFrames() {
    return Math.max(0, this.consumedFrames - this.deviceLatencyFrames);
  }
  now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }
  /** Create/resume the AudioContext and the worklet node. Must be called
   * from a user gesture the first time (resume() needs it). `workletUrl`
   * must point at the transpiled worklet module (audioWorklet.addModule
   * requires a same-origin URL — e.g. Vite's `?url` import of worklet.js). */
  async start(core, workletUrl) {
    if (this.running && this.paused) {
      await this.resume();
      return;
    }
    if (this.running) return;
    this.core = core;
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    if (!this.node) {
      if (!workletUrl) {
        throw new StateError(
          "WebAudioOutput.start requires a workletUrl (transpiled worklet module) on first start"
        );
      }
      if (!this.ctx.audioWorklet) {
        throw new StateError(
          "AudioWorklet unavailable: the page must be served over HTTPS or localhost (insecure contexts do not expose AudioContext.audioWorklet)"
        );
      }
      await this.ctx.audioWorklet.addModule(workletUrl);
    }
    if (!this.node) {
      const node = new AudioWorkletNode(this.ctx, "modplay-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });
      node.connect(this.ctx.destination);
      this.node = node;
    } else {
      this.node.connect(this.ctx.destination);
    }
    if (typeof SharedArrayBuffer !== "undefined" && crossOriginIsolated) {
      const header = new Int32Array(new SharedArrayBuffer(8));
      const ring = new Float32Array(new SharedArrayBuffer(RING_FRAMES * 2 * 4));
      this.header = header;
      this.ring = ring;
      this.writePos = 0;
      this.renderScratch = new Float32Array(CHUNK_FRAMES * 2 * 4);
      const init = { mode: "sab", header, data: ring };
      this.node.port.postMessage(init);
    } else {
      this.header = null;
      this.ring = null;
      this.renderScratch = new Float32Array(CHUNK_FRAMES * 2 * 4);
      this.node.port.onmessage = (ev) => {
        const m = ev.data;
        if (m.mode === "depth" && typeof m.buffered === "number") {
          this.copyDepth = m.buffered;
          this.debugInfo.copyDepth = m.buffered;
          const consumed = typeof m.drained === "number" ? m.drained : this.copyPostedFrames - m.buffered;
          this.copyConsumedFrames = consumed;
          this.copyConsumedAt = this.now();
        }
      };
      this.node.port.postMessage({ mode: "copy" });
      this.copyDepth = 0;
    }
    this.running = true;
    this.endedFired = false;
    this.copyPostedFrames = 0;
    this.copyDepth = 0;
    this.copyConsumedFrames = 0;
    this.copyConsumedAt = this.now();
    this.renderTimer = window.setInterval(() => this.renderAhead(), 25);
    this.renderAhead();
  }
  /** Stop output: halt the render loop, disconnect, suspend the context.
   * Player state (order/row/voices) is preserved — the next start() resumes
   * the song from where it stopped. */
  stop() {
    this.running = false;
    this.paused = false;
    if (this.drainTimer !== null) {
      window.clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    if (this.renderTimer !== null) {
      window.clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.node) {
      this.node.port.postMessage({ mode: "clear" });
      this.node.disconnect();
    }
    if (this.header) {
      this.writePos = 0;
      Atomics.store(this.header, 0, 0);
      Atomics.store(this.header, 1, 0);
    }
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
    }
  }
  /** Pause playback: freeze the render loop and mute the output while
   * keeping the player's song position and voice state intact. The
   * AudioContext suspends too, so device power draw drops. */
  pause() {
    if (!this.running || this.paused) return;
    const frozen = this.consumedFrames;
    this.paused = true;
    this.copyConsumedFrames = frozen;
    this.copyConsumedAt = this.now();
    if (this.renderTimer !== null) {
      window.clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.ctx && this.ctx.state === "running") {
      void this.ctx.suspend();
    }
  }
  /** Resume from pause(): restart the render loop and the context. The
   * worklet node stays connected, so no transport reconfiguration is
   * needed. Resuming the context requires a user gesture. */
  async resume() {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.copyConsumedAt = this.now();
    if (this.ctx) {
      await this.ctx.resume();
    }
    this.renderTimer = window.setInterval(() => this.renderAhead(), 25);
    this.renderAhead();
  }
  /**
   * Discard all buffered audio after a seek: the ring keeps the pre-seek
   * tail (up to ~0.7s in the SAB mode, the FIFO in the copy mode), which
   * would play out before the repositioned audio arrives. After the
   * flush the next renderAhead() fills the ring with the seeked audio.
   */
  flush() {
    if (this.header !== null) {
      const read = Atomics.load(this.header, 1);
      this.writePos = read;
    } else if (this.node) {
      this.node.port.postMessage({ mode: "clear" });
      this.copyConsumedFrames = this.copyPostedFrames;
      this.copyConsumedAt = this.now();
    }
  }
  /** True while playback is paused (started, but the render loop frozen). */
  get pausedState() {
    return this.paused;
  }
  /** Arm the end-of-drain timer: stop() + onEnded once `bufferedFrames` of
   * already-rendered audio have played out (+ a small margin so suspend()
   * never lands before the last frames reach the device; the worklet
   * zero-fills the overshoot). The duration must come from the transport's
   * actual backlog — at end-of-module the SAB ring sits at
   * HIGH_WATER_FRAMES (~0.7s) while the copy FIFO holds ~200ms — a fixed
   * timeout tuned for one path truncates the other's tail. */
  armDrain(bufferedFrames, sampleRate) {
    const tailMs = bufferedFrames / sampleRate * 1e3;
    this.drainTimer = window.setTimeout(() => {
      this.drainTimer = null;
      this.stop();
      this.onEnded?.();
    }, tailMs + 60);
  }
  /** The AudioContext sample rate — configure the core to match. */
  get audioContextSampleRate() {
    return this.ctx?.sampleRate ?? 0;
  }
  /** Create the AudioContext (no resume — safe pre-gesture) and return its
   * device rate so the core can render at the same rate. */
  async deviceSampleRate() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx.sampleRate;
  }
  /** Whether the node is currently connected. */
  get connected() {
    return this.running && this.node !== null;
  }
  /** Render one playBuffer chunk into the transport. */
  renderAhead() {
    const core = this.core;
    if (!core || !this.running) return;
    if (this.mode === "sab") {
      const header = this.header;
      const ring = this.ring;
      const capacity = RING_FRAMES;
      let write = this.writePos;
      const read = Atomics.load(header, 1);
      const buffered = write - read;
      if (buffered > HIGH_WATER_FRAMES) return;
      const space = capacity - buffered - CHUNK_FRAMES;
      if (space < CHUNK_FRAMES) return;
      const scratch2 = this.renderScratch;
      const frames = Math.min(space, CHUNK_FRAMES * 4);
      const n2 = core.playBuffer(scratch2, frames * 2, 1);
      if (n2 <= 0) {
        if (!this.endedFired) {
          this.endedFired = true;
          this.armDrain(write - Atomics.load(header, 1), this.ctx.sampleRate);
        }
        return;
      }
      let s = 0;
      while (s < n2) {
        const idx = write % capacity;
        ring[idx * 2] = scratch2[s];
        ring[idx * 2 + 1] = scratch2[s + 1];
        write++;
        s += 2;
      }
      this.writePos = write;
      this.debugInfo.renderedFrames = write;
      Atomics.store(header, 0, write);
      this.onRender?.(write, core);
      if (write - this.lastLoggedWrite >= this.ctx.sampleRate) {
        this.lastLoggedWrite = write;
        console.log("[webaudio] sab render", {
          written: write,
          read: Atomics.load(header, 1),
          ctxState: this.ctx.state
        });
      }
      return;
    }
    const core2 = this.core;
    if (!core2) return;
    if (this.copyDepth > COPY_HIGH_WATER_FRAMES) return;
    const needFrames = Math.min(
      COPY_HIGH_WATER_FRAMES - this.copyDepth,
      CHUNK_FRAMES * 4
      // never exceed the scratch capacity (16384 floats)
    );
    if (needFrames < CHUNK_FRAMES) return;
    const scratchFloats = needFrames * 2;
    const scratch = this.renderScratch ?? (this.renderScratch = new Float32Array(CHUNK_FRAMES * 2 * 4));
    const n = core2.playBuffer(scratch, scratchFloats, 1);
    if (n <= 0) {
      if (!this.endedFired) {
        this.endedFired = true;
        this.armDrain(this.copyDepth, this.ctx?.sampleRate ?? 44100);
      }
      return;
    }
    this.copyPostedFrames += n / 2;
    this.copyDepth += n / 2;
    this.debugInfo.renderedFrames = this.copyPostedFrames;
    if (this.copyPostedFrames - this.lastLoggedWrite >= (this.ctx?.sampleRate ?? 44100)) {
      this.lastLoggedWrite = this.copyPostedFrames;
      console.log("[webaudio] copy render", {
        postedFrames: this.copyPostedFrames,
        workletDepth: this.copyDepth,
        ctxState: this.ctxState
      });
    }
    for (let off = 0; off < n; off += CHUNK_FRAMES * 2) {
      const frames = Math.min(CHUNK_FRAMES, (n - off) / 2);
      const chunk = new Float32Array(frames * 2);
      chunk.set(scratch.subarray(off, off + frames * 2));
      this.debugInfo.postedChunks++;
      this.node?.port.postMessage({ mode: "chunk", data: chunk }, [chunk.buffer]);
    }
    this.onRender?.(this.copyPostedFrames, core2);
  }
  get mode() {
    return this.header !== null ? "sab" : "copy";
  }
};
function createWebAudioOutput() {
  return new WebAudioOutput();
}
export {
  WebAudioOutput,
  createWebAudioOutput
};
