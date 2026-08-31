// out-webaudio main-thread side (OutputPlugin).
//
// Owns the AudioContext, the AudioWorkletNode, and the render-ahead loop.
// Play/stop/resume shape follows reference/Paula-Tracker
// src/platform/audio-web.js:25-76 with ScriptProcessorNode replaced by
// AudioWorklet (user decision) and the render drive moved to the main
// thread via Core.playBuffer (player.c:2178-2233).
//
// Transport: SharedArrayBuffer ring when crossOriginIsolated (the worklet
// drains it — see worklet.ts 'sab' mode); otherwise transferable
// Float32Array chunks posted to the node port ('copy' mode).

import type { Core, OutputPlugin } from '@modplayjs/core';
import { StateError } from '@modplayjs/core';

const RING_FRAMES = 65536; // ~1.4s at 44.1kHz — survives main-thread hiccups
const HIGH_WATER_FRAMES = RING_FRAMES / 2; // stop rendering above this (~0.7s buffered)
const CHUNK_FRAMES = 2048; // copy-mode chunk size (frames; >= one tick)
const COPY_HIGH_WATER_FRAMES = 8820; // ~200ms of buffered audio at 44.1k

interface WorkletInitMessage {
  mode: 'sab' | 'copy';
  header?: Int32Array;
  data?: Float32Array;
}

export class WebAudioOutput implements OutputPlugin {
  readonly name = 'webaudio';

  private core: Core | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private renderTimer: number | null = null;
  private running = false;
  private paused = false;
  /** copy-mode pacing: frames handed to the worklet so far. */
  private copyPostedFrames = 0;
  /** copy-mode backpressure: last reported worklet FIFO depth (frames). */
  private copyDepth = 0;
  private lastLoggedWrite = 0;

  /** Diagnostics for the demo status line (T22/T23). */
  readonly debugInfo = { renderedFrames: 0, postedChunks: 0, copyDepth: 0 };
  /** Current transport ('sab' | 'copy') and AudioContext state. */
  get transportMode(): 'sab' | 'copy' | 'idle' {
    if (!this.running && this.node === null) return 'idle';
    return this.header !== null ? 'sab' : 'copy';
  }
  get ctxState(): string {
    return this.ctx?.state ?? 'no-context';
  }

  // sab ring state (main-thread side)
  private header: Int32Array | null = null;
  private ring: Float32Array | null = null;
  private writePos = 0; // monotonic frames written
  private renderScratch: Float32Array | null = null;

  /** Create/resume the AudioContext and the worklet node. Must be called
   * from a user gesture the first time (resume() needs it). `workletUrl`
   * must point at the transpiled worklet module (audioWorklet.addModule
   * requires a same-origin URL — e.g. Vite's `?url` import of worklet.js). */
  async start(core: Core, workletUrl?: string): Promise<void> {
    if (this.running && this.paused) {
      // start() while paused = resume (idempotent — no node rebuild).
      await this.resume();
      return;
    }
    if (this.running) return; // idempotent — no duplicate nodes
    this.core = core;

    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (!this.node) {
      if (!workletUrl) {
        throw new StateError(
          'WebAudioOutput.start requires a workletUrl (transpiled worklet module) on first start',
        );
      }
      // AudioWorklet requires a SECURE context (HTTPS or localhost). On
      // plain http://<LAN-IP> the AudioContext exists but its
      // .audioWorklet property is absent — fail with a clear message.
      if (!this.ctx.audioWorklet) {
        throw new StateError(
          'AudioWorklet unavailable: the page must be served over HTTPS or localhost ' +
            '(insecure contexts do not expose AudioContext.audioWorklet)',
        );
      }
      await this.ctx.audioWorklet.addModule(workletUrl);
    }

    if (!this.node) {
      const node = new AudioWorkletNode(this.ctx, 'modplay-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      node.connect(this.ctx.destination);
      this.node = node;
    } else {
      // Restart after stop(): the node survived (module already loaded);
      // re-connect it and re-post the transport config.
      this.node.connect(this.ctx.destination);
    }

    // Configure the transport (sab ring when shared memory is allowed).
    if (typeof SharedArrayBuffer !== 'undefined' && crossOriginIsolated) {
      const header = new Int32Array(new SharedArrayBuffer(8));
      const ring = new Float32Array(new SharedArrayBuffer(RING_FRAMES * 2 * 4));
      this.header = header;
      this.ring = ring;
      this.writePos = 0;
      this.renderScratch = new Float32Array(CHUNK_FRAMES * 2 * 4);
      const init: WorkletInitMessage = { mode: 'sab', header, data: ring };
      this.node.port.postMessage(init);
    } else {
      this.header = null;
      this.ring = null;
      // Copy-mode scratch: 4 ticks of headroom (ticksize ≤ 2048 covers
      // 44.1kHz at BPM ≥ 54; playBuffer fills whole ticks only).
      this.renderScratch = new Float32Array(CHUNK_FRAMES * 2 * 4);
      // Backpressure: the worklet reports its FIFO depth; renderAhead
      // fills to the high-water mark. Prime the FIFO with ~150ms so the
      // first quantum never underruns.
      this.node.port.onmessage = (ev: MessageEvent) => {
        const m = ev.data as { mode: string; buffered?: number };
        if (m.mode === 'depth' && typeof m.buffered === 'number') {
          this.copyDepth = m.buffered;
          this.debugInfo.copyDepth = m.buffered;
        }
      };
      this.node.port.postMessage({ mode: 'copy' });
      this.copyDepth = 0;
    }

    this.running = true;
    this.copyPostedFrames = 0;
    this.copyDepth = 0; // worklet FIFO starts empty
    // Render-ahead loop: setInterval drives playBuffer; keeps the ring
    // between the low and high water marks (player.c:2178-2233 pull
    // model, timer-driven on the main thread).
    this.renderTimer = window.setInterval(() => this.renderAhead(), 25);
    this.renderAhead();
  }

  /** Stop output: halt the render loop, disconnect, suspend the context.
   * Player state (order/row/voices) is preserved — the next start() resumes
   * the song from where it stopped. */
  stop(): void {
    this.running = false;
    this.paused = false;
    if (this.renderTimer !== null) {
      window.clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.node) {
      this.node.disconnect();
    }
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  /** Pause playback: freeze the render loop and mute the output while
   * keeping the player's song position and voice state intact. The
   * AudioContext suspends too, so device power draw drops. */
  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    if (this.renderTimer !== null) {
      window.clearInterval(this.renderTimer);
      this.renderTimer = null;
    }
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  /** Resume from pause(): restart the render loop and the context. The
   * worklet node stays connected, so no transport reconfiguration is
   * needed. Resuming the context requires a user gesture. */
  async resume(): Promise<void> {
    if (!this.running || !this.paused) return;
    this.paused = false;
    if (this.ctx) {
      await this.ctx.resume();
    }
    this.renderTimer = window.setInterval(() => this.renderAhead(), 25);
    this.renderAhead();
  }

  /** True while playback is paused (started, but the render loop frozen). */
  get pausedState(): boolean {
    return this.paused;
  }

  /** The AudioContext sample rate — configure the core to match. */
  get audioContextSampleRate(): number {
    return this.ctx?.sampleRate ?? 0;
  }

  /** Create the AudioContext (no resume — safe pre-gesture) and return its
   * device rate so the core can render at the same rate. */
  async deviceSampleRate(): Promise<number> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx.sampleRate;
  }

  /** Whether the node is currently connected. */
  get connected(): boolean {
    return this.running && this.node !== null;
  }

  /** Render one playBuffer chunk into the transport. */
  private renderAhead(): void {
    const core = this.core;
    if (!core || !this.running) return;

    if (this.mode === 'sab') {
      const header = this.header!;
      const ring = this.ring!;
      const capacity = RING_FRAMES;
      let write = this.writePos;
      const read = Atomics.load(header, 1);
      const buffered = write - read;
      if (buffered > HIGH_WATER_FRAMES) return; // ring is healthy
      // Render up to the high-water gap; playBuffer clamps to whole ticks.
      const space = capacity - buffered - CHUNK_FRAMES;
      if (space < CHUNK_FRAMES) return;
      const scratch = this.renderScratch!;
      // Scratch holds CHUNK_FRAMES*2*4 floats = CHUNK_FRAMES*4 frames; the
      // request must never exceed it (playBuffer would write past the end).
      const frames = Math.min(space, CHUNK_FRAMES * 4);
      const n = core.playBuffer(scratch, frames * 2, 1);
      if (n <= 0) return; // module ended; keep the ring as-is
      let s = 0;
      while (s < n) {
        const idx = write % capacity;
        ring[idx * 2] = scratch[s]!;
        ring[idx * 2 + 1] = scratch[s + 1]!;
        write++;
        s += 2;
      }
      this.writePos = write;
      this.debugInfo.renderedFrames = write;
      Atomics.store(header, 0, write);
      // Sab diagnostics: report once per second of rendered audio.
      if (write - this.lastLoggedWrite >= this.ctx!.sampleRate) {
        this.lastLoggedWrite = write;
        console.log('[webaudio] sab render', {
          written: write,
          read: Atomics.load(header, 1),
          ctxState: this.ctx!.state,
        });
      }
      return;
    }

    // copy mode: fill the worklet FIFO to the high-water mark based on its
    // reported depth (exact backpressure — timer jitter cannot starve the
    // device because the FIFO buffers ~200ms).
    const core2 = this.core;
    if (!core2) return;
    if (this.copyDepth > COPY_HIGH_WATER_FRAMES) return; // FIFO healthy
    const needFrames = COPY_HIGH_WATER_FRAMES - this.copyDepth;
    if (needFrames < CHUNK_FRAMES) return;
    const scratchFloats = needFrames * 2;
    const scratch = this.renderScratch ?? (this.renderScratch = new Float32Array(CHUNK_FRAMES * 2 * 4));
    const n = core2.playBuffer(scratch, scratchFloats, 1);
    if (n <= 0) return;
    this.copyPostedFrames += n / 2;
    // Depth decays as the device consumes: consume-rate ≈ device rate for
    // the elapsed interval; the next 'depth' message corrects drift exactly.
    this.copyDepth += n / 2;
    this.debugInfo.renderedFrames = this.copyPostedFrames;
    if (this.copyPostedFrames - this.lastLoggedWrite >= (this.ctx?.sampleRate ?? 44100)) {
      this.lastLoggedWrite = this.copyPostedFrames;
      console.log('[webaudio] copy render', {
        postedFrames: this.copyPostedFrames,
        workletDepth: this.copyDepth,
        ctxState: this.ctxState,
      });
    }
    for (let off = 0; off + CHUNK_FRAMES * 2 <= n; off += CHUNK_FRAMES * 2) {
      const chunk = new Float32Array(CHUNK_FRAMES * 2);
      chunk.set(scratch.subarray(off, off + CHUNK_FRAMES * 2));
      this.debugInfo.postedChunks++;
      this.node?.port.postMessage({ mode: 'chunk', data: chunk }, [chunk.buffer]);
    }
  }

  private get mode(): 'sab' | 'copy' {
    return this.header !== null ? 'sab' : 'copy';
  }
}

export function createWebAudioOutput(): WebAudioOutput {
  return new WebAudioOutput();
}
