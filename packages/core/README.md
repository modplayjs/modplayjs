# @modplayjs/core

Player core for modplayjs: module lifecycle, the frame-accurate sequencer,
effect dispatch, pattern scanner and virtual channels — a TypeScript port of
libxmp's `player.c` / `virtual.c` / `scan.c`, verified frame-for-frame
against the C reference.

## Install

```sh
npm install @modplayjs/core
```

## Quick start

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { createSoftMixerPlugin } from '@modplayjs/dsp-softmixer';

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerDsp(createSoftMixerPlugin());

core.loadModule(bytes);            // Uint8Array of the module file
core.setDsp('softmixer');
core.setSampleRate(48000);
core.startPlayer();

const out = new Float32Array(core.ticksize * 2);
core.playBuffer(out, out.length);  // pull rendered audio
```

Formats and DSPs are plugins: the core alone parses nothing and mixes
nothing. Register what you need (see the `fmt-*`, `dsp-*`, `out-*`
packages).

## API

### Lifecycle
| Method | Notes |
|---|---|
| `loadModule(bytes)` | Parse a MOD/S3M/XM/IT file (via a registered format plugin) and scan the song |
| `loadModuleData(mod)` | Load a programmatically built module (studio path) |
| `startPlayer()` / `stopPlayer()` / `destroy()` | xmp_start_player / xmp_end_player / release |

### Transport & state
| Method | Notes |
|---|---|
| `playBuffer(out, size, loop?)` / `frame(out)` | Pull rendered audio (xmp_play_buffer / xmp_play_frame) |
| `setPosition(ord, row?)` | Seek (control.c set_position), row-accurate |
| `setSpeed(n)` / `setTempo(bpm)` / `setTempoFactor(f)` | Live tempo control |
| `setSampleRate(hz)` | Re-render at a new device rate |
| `setDsp(name)` | Switch the active mixer |
| `setVolume(0..100)` / `getVolume()` | Master volume |
| `setPanSeparation(0..200)` / `getPanSeparation()` | Stereo field width |

### Interactive playback (smix)
| Method | Notes |
|---|---|
| `startSmix(n)` | Reserve `n` extra channels (xmp_start_smix) |
| `playNote(ins, note, vol, chn?)` | Inject a note (xmp_smix_play_instrument) |
| `stopNote(chn)` | Key off an injected voice |
| `setChannelMute(chn, bool)` / `setChannelVol(chn, 0-100)` | Per-channel control |

### Samples
| Method | Notes |
|---|---|
| `getSample(id)` | Sample data + metadata (`name`, loop points, …) |
| `swapSample(id, data, meta?)` | Hot-swap sample data while playing |

`core.playState` exposes the live state (`ord`, `row`, `frame`, `timeMs`,
`speed`, `bpm`, `loopCount`, …); `core.channelStates` the per-channel mixer
state; `core.ordInfo` the per-order timing table.

## Verification

The core is developed against libxmp's own test corpus: internal mixer
state is dumped per frame and diffed against C reference dumps
(`tools/run-mixer-data-tests.sh` in the repo — 105/105 golden fixtures
pass). See the [monorepo README](../../README.md) for the full harness.

## Plugin contracts

Writing a format loader, DSP mixer or output? See
[docs/plugin-api-format.md](../../docs/plugin-api-format.md),
[docs/plugin-api-dsp.md](../../docs/plugin-api-dsp.md) and
[docs/plugin-api-output.md](../../docs/plugin-api-output.md).

## License

BSD-3-Clause — see the [monorepo LICENSE](../../LICENSE). Ported
third-party material keeps its original licensing (see [NOTICE](../../NOTICE)).
