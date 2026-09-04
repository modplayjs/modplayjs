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

### Mixer-state parity harness

`tools/run-mixer-data-tests.sh` replays libxmp's own test modules and diffs
our internal mixer state against the reference dumps, frame by frame:

```text
100 passed / 5 failed  (65 fixtures without .data)
```

The 5 remaining failures are analyzed with C-referenced root causes in
[docs/REMAINING-PARITY.md](docs/REMAINING-PARITY.md) — each is either a
deep fixed-point precision divergence (porta slide ±5 of ~3.1M), a known
stale golden, or a real port bug (NNA voice-pool flood, DCT flow divergence,
retrig × envelope interplay) with a documented reproduction path.

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
| `@modplayjs/out-webaudio` | AudioWorklet output: SAB ring (COOP/COEP) with automatic copy-mode fallback, pause/resume |
| `@modplayjs/out-pcm` | Offline PCM render + WAV encoder |
| `@modplayjs/demo` | Demo page: transport, channel mute strip, instrument/sample audition, file info, order list, tracker message, realtime pattern view with legend |

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
# (the dev server sends COOP/COEP; production builds use the bundled
#  coi-serviceworker so GitHub Pages gets the SAB transport too)
```

## License

BSD-3-Clause — see [LICENSE](LICENSE). Ported third-party material remains
under its original licensing (OpenMPT BSD-3-Clause, libxmp MIT,
Paula-Tracker MIT) — see [NOTICE](NOTICE).

Code written by an AI assistant from the reference implementations above;
review, debugging, verification and testing by Bitti09.
