# Output plugin API

An **output plugin** consumes the rendered audio. The repo ships
`out-webaudio` (AudioWorklet, browser), `out-pcm` (offline PCM/WAV) and
`out-android` (the Android session). Output plugins PULL audio: they call
`core.playBuffer(out, size, loop)` whenever they need more samples.

## The interface

```ts
interface OutputPlugin {
  /** Name used for core.output(name). */
  readonly name: string;
  /** Begin output (called after startPlayer). */
  start(core: Core): void;
  /** Stop output. */
  stop(): void;
}
```

Registration:

```ts
import { createPcmOutput } from '@modplayjs/out-pcm';
core.registries.registerOutput(createPcmOutput());
```

Note: the shipped `WebAudioOutput` extends this contract at runtime
(`start(core, workletUrl?)`, `pause()`, `resume()`, `stop()`,
`onEnded`) — the browser needs a worklet URL and a user gesture on the
first start; `pause()`/`resume()` freeze/restart the render loop and
suspend/resume the AudioContext while preserving the player's song
position.

## Pull model

`core.playBuffer(out, size, loop?)` renders whole ticks into `out`
(interleaved stereo floats) until `out` is full or the module ends:

- returns `> 0`: the number of interleaved floats written (normally `size`);
- returns `0`: the song ended while this buffer was being filled. The audio
  already written is valid, the rest of the buffer is zero-filled. Stop after
  this call;
- returns `-1`: the song was already ended when the call started, nothing was
  written. This is the definitive end signal;
- `loop` defaults to **1** (play once). `loop = n > 0` stops after `n` loops;
  `loop = 0` ignores the loop count and plays forever. Endless modules ignore
  the loop count as well.

The output plugin decides when to pull: an event loop, a timer, a worker,
or an AudioWorklet-driven callback. Treat `0` and `-1` as end-of-song; a loop
that only checks `-1` keeps pulling past the end, and one that treats `0` as
"nothing written" drops the final partial buffer. The shipped `out-webaudio`
also fires an `onEnded` callback ~250 ms after end so the final ring contents
can drain audibly first.

## Pacing rules

- `playBuffer` fills only whole ticks — `out` must be at least
  `ticksize × 2` floats per pull to make progress. Ticksize varies with
  BPM (`(int)(rate × 2500 / bpm)`), so size `out` with headroom (the
  shipped webaudio output uses ≥ 4 ticks of scratch).
- The `loop` argument: `loop = 1` (default) plays the module once;
  `loop = n > 0` stops after n loops; `loop = 0` never stops on the loop
  count. The demo uses the default and treats `0` / `-1` as end-of-track.
- Render-ahead pacing: pull more audio only when the consumer has drained
  below a high-water mark, otherwise skip the pull (this keeps the
  player's song clock aligned with audible playback — the core only
  advances when audio is pulled).

## Example: memory-capturing output

```ts
import type { OutputPlugin } from '@modplayjs/core';

export function createCaptureOutput(): OutputPlugin & { pcm: Float32Array } {
  const self = {
    name: 'capture',
    pcm: new Float32Array(0),
    start(core: Core) {
      const out = new Float32Array(core.ticksize * 2 * 4);
      const chunks: Float32Array[] = [];
      for (;;) {
        const n = core.playBuffer(out, out.length, 1);
        if (n < 0) break;               // already ended, nothing written
        if (n === 0) {                  // ended during this buffer
          chunks.push(out.slice());     // valid audio + zero tail
          break;
        }
        chunks.push(out.slice(0, n));
      }
      const all = new Float32Array(chunks.reduce((s, c) => s + c.length, 0));
      let o = 0;
      for (const c of chunks) { all.set(c, o); o += c.length; }
      self.pcm = all;
    },
    stop() {},
  };
  return self as OutputPlugin & { pcm: Float32Array };
}
```

(`@modplayjs/out-pcm` is a fuller version of this — tick-accurate offline
render plus a 16-bit stereo WAV encoder.)

## Browser output (out-webaudio)

The webaudio output uses an AudioWorkletNode as the device. Two
transports are supported, chosen at `start()`:

- **SAB ring** (default when `crossOriginIsolated`): the main thread
  writes into a `SharedArrayBuffer` ring; the worklet reads it on the
  audio thread with `Atomics`-guarded positions. Hardware-paced
  backpressure via the ring high-water mark.
- **copy mode** (no SAB): the main thread posts transferable
  `Float32Array` chunks to the worklet, paced by the worklet's reported
  FIFO depth.

Pause/resume freeze the render loop and suspend the AudioContext while
keeping the player state; `onEnded` fires at natural end-of-song.
