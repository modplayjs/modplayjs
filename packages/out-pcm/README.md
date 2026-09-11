# @modplayjs/out-pcm

Offline **PCM render + WAV encoder** for `@modplayjs/core` — render a
module to float32 stereo (or raw PCM) without a real-time output, and
encode it as a WAV file. This is what the verification harness and the
studio's export path use.

## Install

```sh
npm install @modplayjs/out-pcm
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
import { PcmOutput, createPcmOutput, encodeWavStereo } from '@modplayjs/out-pcm';

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerDsp(createSoftMixerPlugin());
core.loadModule(bytes);
core.setDsp('softmixer');
core.startPlayer();

const output = new PcmOutput();
output.start(core);          // renders the whole module now (one-shot, offline)
const pcm = output.getPcm(); // Float32Array — interleaved stereo at core.sampleRate
const wav = output.getWav(); // Uint8Array — 16-bit stereo WAV, ready to save
```

### API

- `PcmOutput` — an `OutputPlugin` (`name: 'pcm'`). `start(core)` renders
  the whole module via `core.playBuffer` with end-of-song detection
  (~100 ms chunks, ~10 min safety cap). `getPcm()` returns the
  interleaved stereo float32 data; `getWav()` encodes it as a 16-bit
  stereo WAV.
- `createPcmOutput()` — factory (registerable via
  `core.registries.registerOutput`).
- `encodeWavStereo(pcm, sampleRate)` → WAV `Uint8Array` (RIFF header,
  16-bit PCM, stereo) — standalone, works on any float32 data.


Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
