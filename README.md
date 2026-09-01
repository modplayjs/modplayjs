# modplayjs

A browser player library for tracker music formats — **MOD · S3M · XM · IT** —
ported and frame-level verified against the reference player code
(libxmp, OpenMPT, Paula-Tracker).

## Status

All four formats are verified frame-for-frame against C libxmp (48 kHz,
softmixer, full-song renders). Playback correlation of our render against
reference WAVs:

| Module | Format | Correlation |
|---|---|---|
| KHG — HitFilm Ultimate x64 | MOD | 0.9998 |
| KHG — Vegas Pro 12 | MOD | 0.9996 |
| 909DEAD — Adobe CS6 | IT | 0.9999 |
| NBR — Light Image Resizer 4 | IT | 0.9999 |
| 3DAttack LSD 1.01 | XM | 0.9997 |
| Knetus — UltraEdit-32 | XM | 0.9995 |
| MANtiCORE — IRLink 3 | S3M | 0.9980 |

## Plugin APIs

Contributors writing mixers, format loaders or outputs: the core's plugin
contracts are documented in [docs/](docs/) —
[DSP plugin API](docs/plugin-api-dsp.md),
[Format plugin API](docs/plugin-api-format.md),
[Output plugin API](docs/plugin-api-output.md).

## Packages

| Package | Purpose |
|---|---|
| `@modplayjs/core` | Player core: module lifecycle, frame loop, effect dispatch, scanner, virtual channels |
| `@modplayjs/fmt-mod` | ProTracker/SoundTracker/NoiseTracker MOD loader (19 tracker variants) |
| `@modplayjs/fmt-s3m` | S3M loader |
| `@modplayjs/fmt-xm` | XM loader (FT2 semantics, ADPCM, Ogg patterns) |
| `@modplayjs/fmt-it` | IT loader (IT215 decompression, MIDI macros, note delay) |
| `@modplayjs/effects-shared` | Shared effect handlers and per-frame stages (frame-accurate C port) |
| `@modplayjs/dsp-paula` | Amiga Paula-emulating mixer (MOD) |
| `@modplayjs/dsp-softmixer` | libxmp-parity software mixer (S3M/XM/IT, A500 optional) |
| `@modplayjs/out-webaudio` | AudioWorklet output: SAB ring + transferable copy transport, pause/resume |
| `@modplayjs/out-pcm` | Offline PCM render + WAV encoder |
| `@modplayjs/demo` | Playback page: file info, instrument/sample lists, realtime pattern view, pause |

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';
import { WebAudioOutput } from '@modplayjs/out-webaudio';

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerDsp(createSoftMixerPlugin());

await core.loadModule(bytes);          // Uint8Array of the module file
core.setDsp('softmixer');
core.setSampleRate(deviceSampleRate);  // render at the device rate
core.startPlayer();

const out = new WebAudioOutput();
await out.start(core, workletUrl);     // user gesture required once

// pause / resume / stop
out.pause();
await out.resume();
out.stop();
```

Sample names from the file are available per sample:
`core.samples.get(id).name`.

## Playback behavior

- Timing, effects and channel state mirror libxmp's `player.c`, including
  ProTracker per-row vibrato rules, integer LFO truncation, IT NNA/DCA/DCT,
  note delay, pattern delay, loops, and the scanner-driven song end.
- MOD variants (ProTracker / NoiseTracker / TakeTracker / Digital Tracker /
  OpenMPT / converted-ST) are auto-detected and mapped to matching quirk sets.
- Sample positions follow libxmp's mixer: per-chunk 16.16 fixed-point
  updates, integer-truncated vibrato, per-note anticlick — verified against
  the C reference.

## How it was verified

A ready-made harness runs this comparison for any module file:

```sh
tools/build-ref-libxmp.sh /tmp/libxmp4.a   # once: build the reference lib
tools/correlate.mjs <module-file> [--seconds n]
```

Internally, a minimal C harness links libxmp from the reference sources and dumps its
internal mixer voice state (`voice_array`: per-voice channel/root/sample/
position/volume/pan/note) once per frame. Our player emits the same state
stream; a diff pinpoints bugs at exact C ticks — this is how the fixed
issues above were found (fixed-point position updates, integer LFO
truncation, missing dual effects, IT NNA allocation, relative pattern
breaks). `MISSING-OPTIONS.md` tracks remaining XMPlay-specific options.

## Development

Turborepo monorepo (`apps/` + `packages/`):

```sh
npm install
npx turbo run typecheck
npx turbo run build            # all workspaces
npx turbo run dev --filter=@modplayjs/demo   # demo page
# (COOP/COEP headers in the demo vite config enable the SAB transport)
```

## License

BSD-3-Clause — see [LICENSE](LICENSE). Ported third-party material remains
under its original licensing (OpenMPT BSD-3-Clause, libxmp MIT,
Paula-Tracker MIT) — see [NOTICE](NOTICE).

Code written by an AI assistant from the reference implementations above;
review, debugging, verification and testing by Bitti09.
