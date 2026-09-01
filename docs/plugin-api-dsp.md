# DSP plugin API

A **DSP plugin** is a mixer: it turns the player's per-channel state into
rendered audio. The core ships two — `dsp-softmixer` (libxmp-parity software
mixer for S3M/XM/IT and the generic MOD path) and `dsp-paula` (Amiga
Paula emulation for MOD). Exactly one DSP is active at a time; it is
selected after `loadModule` and before `startPlayer`.

## The interface

```ts
interface DspPlugin {
  /** Name used for core.setDsp(name). */
  readonly name: string;
  /** Number of channels this DSP mixes (Paula = 4, softmixer = module chn). */
  readonly channels: number;
  /** Render `ticks` ticks into `out` (interleaved stereo). */
  renderFrame(core: Core, out: Float32Array, ticks: number): void;
  /** Optional per-row hook: called after the format event reader for each
   * channel (e.g. Paula's sample-position reset on retrigger). */
  onRow?(core: Core, chn: number, ev: Event): void;
  /** Reset internal state (called on start/stop). */
  reset(): void;
}
```

Registration:

```ts
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
core.registries.registerDsp(createSoftMixerPlugin());
core.setDsp('softmixer');   // only while the player is stopped
```

## What the core guarantees

- **Binding time model** (identical for every format):
  `ticksize = (int)(sampleRate × 10 × 250 / bpm / 1000)` — truncation,
  not rounding. One tick = `ticksize` samples; a row lasts `speed` ticks.
  `ticksize` is recomputed every frame, so tempo changes take effect
  immediately.
- `renderFrame(core, out, ticks)` must fill `out` with
  `ticks × ticksize × 2` interleaved stereo floats (L, R, L, R, …) in the
  range `[-1, 1]`. The core clamps to ±1 before output.
- `core` exposes everything a mixer needs:
  - `core.voiceStates` — per-voice `VoiceState` (chn, root, smp, pos, vol,
    pan, act, flags, filter state, sleft/sright anticlick memory, …)
  - `core.channelStates` — per-channel `ChannelState` (the format reader's
    out-params: volume, pan, period, envelopes, LFOs, slides, macros…)
  - `core.samples.get(id)` — sample data by ID (voices reference samples
    by ID, so hot-swaps are picked up automatically)
  - `core.ctx.s` — mixer settings (`freq`, `interp`, `mix`, `ticksize`,
    `bidir_adjust`…)
  - `core.quirks` — the loaded module's quirk set (format personality)
- The core calls `reset()` on start and stop.
- `onRow` is called for every channel right after the row's events have
  been read and dispatched, in channel order.

## What a DSP must implement itself

libxmp's mixer does a lot of work that a DSP plugin re-implements. The
shipped softmixer is a frame-accurate port (verified against C libxmp)
and is the reference for what "correct" means:

- **Voice allocation awareness**: voices live in `core.voiceStates`; a
  voice is dead when `act === Act.NONE`. Sample references are by ID
  (`v.smp`) and resolved through `core.samples.get(v.smp)`.
- **Binding**: `pos` is a double (sample index), stepped per chunk with
  16.16 fixed-point (`frac`), exactly like libxmp's `UPDATE_POS`. The
  integer step is `trunc(stepFloat × 65536)`.
- **Resampling**: nearest / linear / spline (cubic) kernels — pick by
  `core.ctx.s.interp` (0/1/2).
- **Volume**: `vol_l = vol × (0x80 − pan)`, `vol_r = vol × (0x80 + pan)`
  (pan −128…127 after the player's re-centering), downshifted to a
  0…1 float gain by /524288. `PAN_SURROUND` (0x8000) flips R negative.
- **Ramping**: linear gain ramp `old_vl → vol_l` over `ticksize >> 3`
  frames on every level change and on new notes (anticlick). Track
  `old_vl`/`old_vr` on the voice.
- **Loops**: forward and ping-pong (IT bidir rows shortened by
  `bidir_adjust`), sustain loops, sample-end one-shot death with a
  `(1 − n/count)²` anticlick discharge written into the buffer, sample
  hot-swap (`SAMPLE_QUEUED`), reverse playback.
- **Filters**: IT resonant filter (biquad over the voice, `DSP_EFFECT_*`
  parameters set by the player).
- **End-of-voice semantics**: one-shot voices set `NOTE_SAMPLE_END` on
  the channel (with `QUIRK_RSTCHN` freeing the slot).

## Example: minimal DSP

```ts
import type { DspPlugin } from '@modplayjs/core';

export function createSilentMixer(): DspPlugin {
  return {
    name: 'silent',
    channels: 4,
    renderFrame(core, out, ticks) {
      const ts = core.ticksize;
      for (let t = 0; t < ticks; t++) {
        for (const v of core.voiceStates) {
          // mix v here — read v.pos forward by v.step, apply v.vol/v.pan…
        }
        void ts;
      }
    },
    reset() {},
  };
}
```

Register it, `core.setDsp('silent')`, and the core pulls audio from it
through `playBuffer` like any other DSP.
