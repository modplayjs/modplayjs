# @modplayjs/dsp-softmixer

libxmp-parity **software mixer** DSP plugin for `@modplayjs/core` — the
reference mixer used for S3M/XM/IT playback (and the verification target
for the whole library).

## Install

```sh
npm install @modplayjs/dsp-softmixer
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';

const core = new CorePlayer();
core.registries.registerDsp(createSoftMixerPlugin());
core.setDsp('softmixer');
```

## The mixing domain

Everything mixes in libxmp's exact integer domain: the per-tick buffer is
int32, samples are materialized to native int16/int8 with the C guard
bytes, gains are the C integers (`vol_l >> 8`), positions advance in
16.16 fixed point per chunk (`VAR_NORM` truncation semantics), and the
downmix is `>> (DOWNMIX_SHIFT - amplify)` with int16 clamping. Only the
values handed to the output plugin are converted to float (smp / 32768).

Loop wraparound is handled exactly like C's `init_sample_wraparound`
(1-sample prologue, 2-sample epilogue patches into the shared sample
buffer, restored after each voice) so interpolation reads across loop
boundaries see the same data libxmp sees.

### What it ports (`mixer.c`, `mix_all.c`)

- Nearest / linear / spline interpolation (verbatim int kernels)
- Per-voice 16.16 fixed-point position advance, per-chunk commit
- IT lowpass biquad (`FILTER_LEFT`/`RIGHT`, verbatim shift math)
- Anticlick: exact `do_anticlick` fixed-point discharge + per-note arm
- Loop wraparound patches, bidirectional loops with IT's ping-pong
  one-sample shortening
- Muted channels, ProTracker queued sample swap, `VOICE_REVERSE`
- IT master volume scaling (`mvol`/`mvolbase`), 16-bit sample scaling
- Integer downmix (`downmix_int_16bit`, `XMP_PLAYER_AMPLIFY`)

Verified against the C reference: renders are sample-exact (max diff 0)
on MOD and within a few LSB on XM/S3M/IT across the corpus (the residual
deltas sit on player-phase event boundaries, not in the mixer).

## Options

```ts
export interface SoftMixerOptions {
  /** 'libxmp' (default) or 'paula'. */
  mode?: 'libxmp' | 'paula';
  /** 'panned' (default), 'lrlr' or 'lrrl' (hard L/R layouts for ch < 4). */
  layout?: 'panned' | 'lrlr' | 'lrrl';
  /** Paula mode filter table: 'a500' (LED off) or 'a500led' (LED on). */
  amigaFilter?: 'a500' | 'a500led';
  /** XMP_PLAYER_AMPLIFY (libxmp DEFAULT_AMPLIFY = 1). */
  amplify?: number;
}
```

`configure(options)` re-applies options at runtime (safe while playing;
mode switches should be followed by a tune restart for clean voice
state).

### Paula mode (A500)

`mode: 'paula'` ports libxmp's `LIBXMP_PAULA_SIMULATOR` (`mix_paula.c`,
Antti S. Lankila's Paula simulator): the source sample is stepped at
Paula-clock granularity (`PAULA_HZ = 3546895`, `MINIMUM_INTERVAL = 16`)
with nearest sampling, and every output value switch is rendered as a
band-limited step (BLEP) using the verbatim `precomp_blep.h` integral
tables:

- `amigaFilter: 'a500'` — the fixed A500 output filter (4.9 kHz RC),
  the "LED off" state
- `amigaFilter: 'a500led'` — the LED (power-light) 3.3 kHz lowpass on
  top, the classic dimmed A500 sound (`XMP_FLAGS_A500` + `p->filter`)

Like the C A500 mixers, the Paula path only supports mono 8-bit sources
(4-channel Amiga MOD); other voices are skipped, exactly like the NULL
entries in `libxmp_a500_mixers[]`.

### Channel layouts

`layout` overrides the module pans of the first four channels with hard
left/right assignments:

- `'lrlr'` — ch0 L, ch1 R, ch2 L, ch3 R (alternate wiring)
- `'lrrl'` — ch0 L, ch1 R, ch2 R, ch3 L (OpenMPT `SetupMODPanning` /
  PaulaLib default)

Channels 4+ keep their module pans. Combined with Paula mode this
reproduces the classic 4-channel Amiga stereo image.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
