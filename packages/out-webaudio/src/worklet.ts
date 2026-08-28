// out-webaudio AudioWorklet processor (audio thread).
//
// Runs inside an AudioWorkletGlobalScope. Drains a render-ahead ring fed
// by the main thread into the output channels. The main thread owns the
// Core and renders ahead via playBuffer (xmp_play_buffer,
// player.c:2178-2233); this processor is a tight drain — no parsing, no
// DSP (replaces ScriptProcessorNode, audio-web.js:25-50).
//
// Two transport modes (chosen by the main thread):
// - 'sab': lock-free ring over a SharedArrayBuffer. Header Int32Array:
//   [0] = writePos (main thread writes), [1] = readPos (audio thread
//   writes), monotonic frame counters. Data: interleaved stereo floats.
// - 'copy': main thread posts transferable Float32Array chunks
//   ({type:'chunk', data}) appended to an internal FIFO. Used when
//   SharedArrayBuffer is unavailable (no crossOriginIsolation).

/**
 * Ambient AudioWorkletGlobalScope declarations — lib.dom/lib.webworker
 * in TS 5.x do not ship the worklet-global-scope side, so they are
 * declared here (typed; `unknown` never leaks as `any`).
 */
declare var sampleRate: number;
declare var currentFrame: number;
declare var currentTime: number;
declare var AudioWorkletProcessor: {
  new (options?: { processorOptions?: unknown; numberOfOutputs?: number; outputChannelCount?: number[] }): WorkletProcessorBase;
  prototype: WorkletProcessorBase;
};
declare function registerProcessor(name: string, ctor: unknown): void;

/** Minimal structural base every AudioWorkletProcessor provides. */
export interface WorkletProcessorBase {
  /** Message channel to the AudioWorkletNode (main-thread side). */
  readonly port: MessagePort;
  /** Render callback: return false to ask the host to drop the node. */
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}

/** Internal FIFO used by copy mode. */
class ChunkFifo {
  private chunks: Float32Array[] = [];
  private offset = 0;
  private bufferedFrames = 0;

  push(interleaved: Float32Array): void {
    if (interleaved.length === 0) return;
    this.chunks.push(interleaved);
    this.bufferedFrames += interleaved.length / 2;
  }

  get frames(): number {
    return this.bufferedFrames;
  }

  /** Drain up to need frames into L/R; returns frames actually drained. */
  drain(left: Float32Array, right: Float32Array): number {
    let done = 0;
    const need = left.length;
    while (done < need && this.chunks.length > 0) {
      const head = this.chunks[0]!;
      let i = this.offset;
      while (done < need && i < head.length) {
        left[done] = head[i] as number;
        right[done] = head[i + 1] as number;
        done++;
        i += 2;
      }
      if (i >= head.length) {
        this.chunks.shift();
        this.offset = 0;
      } else {
        this.offset = i;
      }
    }
    this.bufferedFrames -= done;
    return done;
  }
}

class ModPlayProcessor implements WorkletProcessorBase {
  readonly port: MessagePort;

  private mode: 'sab' | 'copy' = 'copy';
  private header: Int32Array | null = null;
  private data: Float32Array | null = null;
  private readonly fifo = new ChunkFifo();
  private drainedFrames = 0;
  private framesSincePost = 0;

  constructor() {
    // AudioWorkletProcessor supplies `port` on instances. The constructor
    // of the base binds it; TS cannot see that, so we bridge the runtime
    // value after super-construction via the ambient base call below.
    const base = new AudioWorkletProcessor() as unknown as {
      port: MessagePort;
    };
    this.port = base.port;
    this.port.onmessage = (ev: MessageEvent) => this.onMessage(ev.data);
    this.port.start();
  }


  private onMessage(
    msg:
      | { mode: 'sab'; header: Int32Array; data: Float32Array }
      | { mode: 'copy' }
      | { mode: 'chunk'; data: Float32Array },
  ): void {
    if (msg.mode === 'sab') {
      this.mode = 'sab';
      this.header = msg.header;
      this.data = msg.data;
    } else if (msg.mode === 'copy') {
      // Copy-mode INIT: switch transport, no payload (webaudio.ts start()).
      this.mode = 'copy';
    } else if (msg.data) {
      this.fifo.push(msg.data);
    }
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>,
  ): boolean {
    const outL = outputs[0]?.[0];
    const outR = outputs[0]?.[1];
    if (!outL || !outR) return true;

    if (this.mode === 'sab' && this.header && this.data) {
      const header = this.header;
      const data = this.data;
      const capacity = data.length / 2; // frames in the ring
      const write = Atomics.load(header, 0);
      const read0 = Atomics.load(header, 1);
      const available = Math.max(0, write - read0);

      const need = outL.length;
      const served = Math.min(need, available);
      let read = read0;
      let done = 0;
      while (done < served) {
        const idx = read % capacity;
        const run = Math.min(served - done, capacity - idx);
        for (let i = 0; i < run; i++) {
          outL[done + i] = data[(idx + i) * 2] as number;
          outR[done + i] = data[(idx + i) * 2 + 1] as number;
        }
        read += run;
        done += run;
      }
      Atomics.store(header, 1, read);
      // Graceful underrun: zero-fill the tail (no NaN).
      outL.fill(0, served);
      outR.fill(0, served);
      return true;
    }

    // copy mode: drain the FIFO, zero-fill the tail on underrun.
    const drained = this.fifo.drain(outL, outR);
    outL.fill(0, drained);
    outR.fill(0, drained);
    // Diagnostics (T22/T23): report drain activity to the main thread.
    this.drainedFrames += drained;
    this.framesSincePost += drained;
    if (this.framesSincePost >= 44100) {
      this.port.postMessage({ mode: 'stats', drainedFrames: this.drainedFrames });
      this.framesSincePost = 0;
    }
    return true;
  }
}

// Register ModPlayProcessor directly: its constructor composes the runtime
// base (bridging `port`), so no subclass/prototype grafting is needed.
// Guarded: headless node imports have no worklet scope.
if (typeof AudioWorkletProcessor !== 'undefined') {
  registerProcessor('modplay-processor', ModPlayProcessor as unknown as unknown);
}

export { ModPlayProcessor, ChunkFifo };
