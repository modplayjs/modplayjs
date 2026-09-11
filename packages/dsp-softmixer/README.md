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

### What it ports (`mixer.c`, `mix_all.c`)

- Nearest / linear / spline interpolation
- Per-voice 16.16 fixed-point position advance, per-chunk commit
- Amiga LED lowpass filter (IT `FILTER` quirk) with per-channel biquad
- Anticlick: per-note discharge ramp + queued-swap hot-swap
- Bidirectional loops with IT's one-sample ping-pong shortening
- Muted-channel handling, sample hot-swap (ProTracker queue), VOICE_REVERSE
- IT master volume scaling (`mvol`/`mvolbase`), 16-bit sample scaling

An optional A500 LED-filter profile (`LIBXMP_PAULA_SIMULATOR` parity) is
available for MOD playback. For cycle-counted Amiga Paula emulation use
[`@modplayjs/dsp-paula`](https://www.npmjs.com/package/@modplayjs/dsp-paula)
instead.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
