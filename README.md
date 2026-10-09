# modplayjs

A browser player library for tracker + chiptune formats —
**MOD · S3M · XM · IT · MTM · STM · 669 · MED · MO3 · FC · SID** and more —
ported from reference player code (libxmp, OpenMPT, cRSID, stb_vorbis,
minimp3) and verified against C reference oracles at the loader-byte and
render-sample level.

## Status

Every file with a C reference parser loads — **0 load failures across the
5,534-file test corpus**. Verification status by format:

### Tracker loaders (libxmp ports) — byte-exact module data

MOD (all 19 tracker variants + ProWizard-packed variants), S3M, XM, IT,
MTM, STM, 669, Soundtracker ST, Ice Tracker, Asylum, DIGI Booster, MED/
OctaMED — full-pack loader sweeps are byte-identical to libxmp's ModuleData
(mod 1,093 + s3m 94 + it 254 + xm full pack, all PASS; 170-file libxmp
corpus 146/146).

### Render parity (libxmp-parity softmixer)

Playback correlation against reference renders, typical in-tune files:

| Module | Format | Correlation |
|---|---|---|
| KHG — HitFilm Ultimate x64 | MOD | 0.9998 |
| KHG — Vegas Pro 12 | MOD | 0.9996 |
| 909DEAD — Adobe CS6 | IT | 0.9999 |
| NBR — Light Image Resizer 4 | IT | 0.9999 |
| 3DAttack LSD 1.01 | XM | 0.9997 |
| Knetus — UltraEdit-32 | XM | 0.9995 |
| MANtiCORE — IRLink 3 | S3M | 0.9980 |

### SID (cRSID port) — sample-exact

`@modplayjs/fmt-sid` is a 1:1 TypeScript port of libcRSID 1.58 (Hermit,
integer-only C64 SID emulation). Verified byte-identical against a C
oracle build of the reference tree on **all 48 pack .sid files** (5 s
renders; incl. the RSID file, CIA-timed tunes and multi-subtune files);
spot checks at 30 s render for 30 s and the standard player pipeline
(`corr 1.0000, maxdiff 0.000`). This is the reference implementation's
own audio — see engine-fidelity notes vs reSIDfp in the commit history.

### MO3 / FutureComposer — loads exact, engine notes

- `.mo3`: container/LZ depacker byte-exact; delta/delta-prediction samples
  exact; **Ogg samples bit-exact** via the stb_vorbis C port; MP3 samples
  decoded via the minimp3 L3 TS port (correct playback, not bit-exact vs
  the C reference's mpg123 path).
- `.fc13/.fc14`: loader is a 1:1 Load_fc.cpp port (20/20 load); the
  InstrumentSynth engine port renders recognizably with exact pitch
  mapping; residual synth-engine deltas are documented in
  [docs/REMAINING-PARITY.md](docs/REMAINING-PARITY.md).

### Streamed audio (WAV/MP3/OGG)

74 of 76 pack files decode via `@modplayjs/stream-audio` (the last two use
Creative/G.723 ADPCM codecs; not planned).

### Mixer-state parity harness

`tools/run-mixer-data-tests.sh` replays libxmp's own test modules and diffs
our internal mixer state against the reference dumps, frame by frame:

```text
110 passed / 0 failed
```

The remaining state-level divergences are analyzed with C-referenced
root causes in [docs/REMAINING-PARITY.md](docs/REMAINING-PARITY.md).

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
| `@modplayjs/fmt-mtm` | Multitracker MTM loader |
| `@modplayjs/fmt-stm` | Scream Tracker 2 (.stm) loader |
| `@modplayjs/fmt-669` | Composer 669 / UNIS 669 loader |
| `@modplayjs/fmt-st` | Ultimate Soundtracker (ST/UST) loader |
| `@modplayjs/fmt-ice` | Soundtracker 2.6 / Ice Tracker (MTN/IT10) loader |
| `@modplayjs/fmt-asylum` | Asylum Music Format v1.0 (AMF) loader |
| `@modplayjs/fmt-digi` | DIGI Booster loader |
| `@modplayjs/fmt-med` | MED / OctaMED loader (MMD0–MMD3, MED2/3/4 instruments) |
| `@modplayjs/fmt-prowizard` | ProWizard packed-MOD depackers (30 formats: PowerPacker, XPK, StoneArts, Starpack, …) |
| `@modplayjs/fmt-mo3` | Un4seen MO3 container (XM/IT/S3M/MOD/MTM inner formats) |
| `@modplayjs/fmt-fc` | Future Composer 1.0–1.4 (SMOD/FC14) with InstrumentSynth engine port |
| `@modplayjs/fmt-sid` | Commodore 64 SID music (PSID/RSID) — full cRSID engine port (6510 CPU + SID chip + CIA/VIC), live quality/stereo/volume + chip/video overrides |
| `@modplayjs/stb-vorbis` | stb_vorbis Ogg Vorbis decoder (OpenMPT stb_vorbis.c port; bit-exact vs C) |
| `@modplayjs/stream-audio` | WAV/MP3/OGG streamed-audio decode for file-based playback |
| `@modplayjs/effects-shared` | Shared effect handlers and per-frame stages (frame-accurate C port) |
| `@modplayjs/dsp-paula` | Amiga Paula-emulating mixer (MOD) — **deprecated**, superseded by `dsp-softmixer`'s Paula mode |
| `@modplayjs/dsp-softmixer` | libxmp-parity software mixer (exact integer mixing domain) + A500 Paula BLEP mode (`mode: 'paula'`), L/R layouts, `XMP_PLAYER_AMPLIFY` |
| `@modplayjs/out-webaudio` | AudioWorklet output: SAB ring (COOP/COEP) with automatic copy-mode fallback, pause/resume |
| `@modplayjs/out-pcm` | Offline PCM render + WAV encoder |
| `@modplayjs/demo` | Demo page (GitHub Pages): player with transport/seek/volume, channel mute strip, instrument/sample audition, file info, order list, tracker message, realtime pattern view |

## Interactive playback API

Beyond `startPlayer`/`stop`, the core exposes libxmp's control surface for
interactive use:

```ts
core.startSmix(4);                 // reserve channels (xmp_start_smix)
core.playNote(ins, note, vol);     // xmp_smix_play_instrument — audition
core.stopNote(chn);                // key-off an audition voice
core.setChannelMute(chn, true);    // xmp_channel_mute
core.setChannelVol(chn, 80);       // xmp_channel_vol (0-100)
```

The demo wires these into a channel mute strip and ▶ audition buttons on
every instrument/sample row (auto-starting playback in a song-muted jam
mode when pressed while stopped).

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

One harness covers all libxmp-loadable + MO3/FC/SID formats:

```sh
tools/build-ref-libxmp.sh /tmp/libxmp4.a   # once: build the reference lib
tools/correlate.mjs <module-file> [--seconds n]
```

Renders the file through our player and through the C reference at 48 kHz
and diffs the audio. The reference engine is picked per format: libxmp for
the tracker formats, libopenmpt (built from `reference/openmpt`) for
MO3/FC, and the cRSID CLI oracle (built from `reference/cRSID-1.58`, see
its README "LOCAL BUILD PATCHES") for SID.

Three comparison levels are used during development:

1. **Loader byte-parity** — our parsed ModuleData vs the C reference's,
   diffed per file (`tools/deep-parity-sweep.sh <ext...>`); the tracker
   loaders are byte-identical across the full test corpus.
2. **Mixer-state parity** — a minimal C harness dumps libxmp's internal
   mixer voice state (`voice_array`: channel/root/sample/position/volume/
   pan/note) once per frame; our player emits the same state stream and a
   diff pinpoints bugs at exact C ticks (`tools/run-mixer-data-tests.sh`,
   currently 110 passed / 0 failed). This is how the fixed issues were
   found (fixed-point position updates, integer LFO truncation, missing
   dual effects, IT NNA allocation, relative pattern breaks).
3. **Render byte-parity** — for self-contained sample-paced engines
   (SID) the full audio stream is compared sample-for-sample against the
   C oracle, not just correlated.

`MISSING-OPTIONS.md` tracks remaining XMPlay-specific options.

## Development

Turborepo monorepo (`apps/` + `packages/`):

```sh
npm install
npx turbo run typecheck
npx turbo run build            # all workspaces
npx turbo run dev --filter=@modplayjs/demo   # demo page
# (the dev server sends COOP/COEP; production builds use the bundled
#  coi-serviceworker so GitHub Pages gets the SAB transport too)
```

## License

BSD-3-Clause — see [LICENSE](LICENSE). Ported third-party material remains
under its original licensing (OpenMPT BSD-3-Clause, libxmp MIT,
Paula-Tracker MIT, cRSID 1.58 WTFPL-style public-domain-style license by
Hermit/Mihály Horváth, stb_vorbis public domain) — see [NOTICE](NOTICE).

Code written by an AI assistant from the reference implementations above;
review, debugging, verification and testing by Bitti09.

## Package registry

> **⚠ All `@modplayjs/*` packages are published to [GitHub Packages](https://github.com/orgs/modplayjs/packages) (`npm.pkg.github.com`), NOT npmjs.com.**
>
> This is because npm Trusted Publisher OIDC doesn't work for first-time
> publishes of new packages, and the npmjs.com account's 2FA blocks
> headless publishing. GitHub Packages uses the workflow token — fully
> automatic.
>
> To install, add a GitHub token (with `read:packages` scope) to
> `~/.npmrc` once:
>
> ```
> //npm.pkg.github.com/:_authToken=YOUR_GH_TOKEN
> ```
>
> Then `npm install @modplayjs/core` works normally.
