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

const RING_FRAMES = 16384; // ~0.37s at 44.1kHz
const HIGH_WATER_FRAMES = RING_FRAMES / 2; // stop rendering above this
const CHUNK_FRAMES = 2048; // copy-mode chunk size (frames; >= one tick)

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

  /** Diagnostics for the demo status line (T22/T23). */
  readonly debugInfo = { renderedFrames: 0, postedChunks: 0 };

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
      this.node.port.postMessage({ mode: 'copy' });
    }

    this.running = true;
    // Render-ahead loop: setInterval drives playBuffer; keeps the ring
    // between the low and high water marks (player.c:2178-2233 pull
    // model, timer-driven on the main thread).
    this.renderTimer = window.setInterval(() => this.renderAhead(), 25);
    this.renderAhead();
  }

  /** Stop output: halt the render loop, disconnect, suspend the context. */
  stop(): void {
    this.running = false;
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

  /** The AudioContext sample rate — configure the core to match. */
  get audioContextSampleRate(): number {
    return this.ctx?.sampleRate ?? 0;
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
      return;
    }

    // copy mode: render a multi-tick scratch (4 × CHUNK_FRAMES frames),
    // then split it into CHUNK_FRAMES-sized chunks for the worklet FIFO.
    const core2 = this.core;
    if (!core2) return;
    const scratchFloats = CHUNK_FRAMES * 2 * 4;
    const scratch = this.renderScratch ?? (this.renderScratch = new Float32Array(scratchFloats));
    const n = core2.playBuffer(scratch, scratchFloats, 1);
    if (n <= 0) return;
    for (let off = 0; off + CHUNK_FRAMES * 2 <= n; off += CHUNK_FRAMES * 2) {
      const chunk = new Float32Array(CHUNK_FRAMES * 2);
      chunk.set(scratch.subarray(off, off + CHUNK_FRAMES * 2));
      this.debugInfo.postedChunks++;
      this.debugInfo.renderedFrames += n / 2;
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
