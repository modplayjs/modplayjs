# @modplayjs/fmt-mid

**Standard MIDI File (.mid) format plugin** for `@modplayjs/core` — SMF
playback through a SoundFont2 softsynth: a pristine 1:1 TypeScript port
of **TinySoundFont v0.9** (Bernhard Schelling) — `tml.h` (SMF parser,
zlib license) and `tsf.h` (SoundFont2 synthesizer, MIT license). Third-
party licenses: see [NOTICE.md](NOTICE.md).

Like SID, MIDI is not a tracker format: the plugin ships a FormatPlugin
stub plus a `mid` DspPlugin that drives the synth directly, using the
exact playback semantics of TinySoundFont's `examples/example3.c`:

- 64-sample blocks (`TSF_RENDER_EFFECTSAMPLEBLOCK`) from sample 0, with
  the message clock advanced by `block * (1000.0 / rate)` **before**
  dispatching every message due at that time
- channel 10 (index 9) initialised to the percussion bank
  (`tsf_channel_set_bank_preset(9, 128, 0)`), drum preset lookup on
  PROGRAM_CHANGE for channel 9
- the reference's own `tsf_render_short` float→s16 quantization

## SoundFont required

The engine needs a SoundFont 2 bank (`.sf2`) — nothing sounds without
one. Load it with `midSetSoundfont(sf2Bytes)` before `midStartTune`.
SF3 (ogg-compressed soundfonts) is not supported, matching a C build of
`tsf.h` without stb_vorbis.

## Deterministic math layer

`tsf.h`'s transcendental macros (`TSF_POW`, `TSF_POWF`, `TSF_EXPF`,
`TSF_LOG`, `TSF_TAN`, `TSF_LOG10`) route through
[`tools/refmath.h`](../../tools/refmath.h) in the C oracle and
[`src/refmath.ts`](src/refmath.ts) here — one shared double-double
implementation built only from IEEE-754 binary64 `+ - * /` and exact
power-of-two scaling. This is required because platform libm rounding is
not reproducible (measured: glibc `pow(2,y)` and V8 `Math.pow` disagree
by up to 11 double ulps in 50% of cases). Both implementations produce
bit-identical results on any IEEE platform; the reference headers are
otherwise untouched (the macros are `tsf.h`'s own extension points).
The C side must be compiled with `-ffp-contract=off`.

## Verification

Rendered audio is **sample-exact** against the C oracle (`tools/midref.c`,
built from the TinySoundFont headers): byte-identical WAV output through
the reference `example3.c` playback loop at 48 kHz on all 110 MIDI files
of the test corpus. Two port bugs were found and fixed through this
harness:

1. region envelope objects were shared instead of value-copied
   (`tsf_region_clear`/merge semantics), letting one zone's in-place
   timecents→seconds conversion pollute the next zone;
2. `p.buf += tml_readvariablelength(...)` — C reloads `p->buf` after the
   call, JS compound assignment snapshots it before, so every sysex
   payload was skipped one byte short and the leftover `0xF7` was eaten
   as a delta-time continuation byte.

## Install

```sh
npm install @modplayjs/fmt-mid
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin, midDsp, midSetSoundfont, midStartTune, midSeek } from '@modplayjs/fmt-mid';

const core = new CorePlayer();
core.registries.registerFormat(plugin);
core.registries.registerDsp(midDsp);
midSetSoundfont(sf2Bytes);            // once per session
core.loadModule(midiBytes, {});
core.setDsp('mid');
core.startPlayer();
midStartTune(midiBytes, sampleRate);  // after startPlayer
// seekbar: midSeek(targetMs)
```

## Also exports

- `midTest` / `midLoad` — direct loader access.
- `getMidPlayTimeMs` — engine playback position (ms).
- `tsf_*` / `tml_*` — the ported synth and parser APIs.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
