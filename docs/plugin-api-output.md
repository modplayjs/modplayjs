# Output plugin API

An **output plugin** consumes the rendered audio. The core ships two —
`out-webaudio` (AudioWorklet, browser) and `out-pcm` (offline PCM/WAV).
Output plugins PULL audio: they call `core.playBuffer(out, size)` whenever
they need more samples.

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

- returns the number of interleaved floats written;
- returns `-1` when the module has ended (with `out` untouched).

The output plugin decides when to pull: an event loop, a timer, a worker,
or an AudioWorklet-driven callback. End-of-module is signalled by
`playBuffer` returning `-1` — handle it (stop pulling, notify the UI).
The shipped `out-webaudio` also fires an `onEnded` callback ~250 ms after
end so the final ring contents can drain audibly first.

## Pacing rules

- `playBuffer` fills only whole ticks — `out` must be at least
  `ticksize × 2` floats per pull to make progress. Ticksize varies with
  BPM (`(int)(rate × 2500 / bpm)`), so size `out` with headroom (the
  shipped webaudio output uses ≥ 4 ticks of scratch).
- The `loop` argument: `loop = 0` plays the module once and then returns
  `-1` on subsequent calls; `loop = n` restarts the song n times. The
  demo uses `loop = 1` and treats `-1` as end-of-track.
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
      let n: number;
      // pull until the module ends
      while ((n = core.playBuffer(out, out.length, 1)) > 0) {
        const c = out.slice(0, n);
        chunks.push(c);
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
