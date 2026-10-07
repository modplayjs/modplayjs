# @modplayjs/fmt-sid

**Commodore 64 SID music (PSID/RSID) plugin** for `@modplayjs/core` — a
pristine 1:1 TypeScript port of **libcRSID 1.58** by Mihály Horváth
(Hermit), from the reference copy in
[`reference/cRSID-1.58`](../../reference/cRSID-1.58/README.txt).

Unlike the tracker formats, SID is a *machine emulation*: the plugin
contains the whole C64 playback machine, not a pattern player —

- **6510 CPU** with the illegal opcodes scene tunes use (CPU.c, 510 lines)
- **SID chip**: oscillators (light + high-quality oversampled paths),
  combined waveforms (4×4096 sampled tables), filter, ADSR with the
  exponential curve + DAC table, $D418 volume-register digi and the
  PSID $D4xx digi player
- **CIA1/2 timers, VIC raster IRQ, PLA memory banking, KERNAL stub ROM**
- **PSID/RSID loader** with Vsync/CIA timing-source selection, subtune
  handling, video-standard (PAL/NTSC) clock selection

All data tables (combined waveforms, filter curves, Sinc window, ADSR
DAC) are verbatim copies, verified byte-identical against the C build.

## Verification

Rendered audio is **sample-exact** against a C oracle built from the
reference tree: byte-identical on all 48 test-corpus .sid files (incl.
the RSID file, CIA-timed tunes, multi-subtune files), and corr 1.0000 /
maxdiff 0.000 through the standard player pipeline at 48 kHz.

Note on engine fidelity: this is the cRSID implementation's own audio —
table-based filter/waveform models, not reSIDfp's sampled-from-silicon
analog models (which are GPL-licensed and cannot be ported here). See
the repository README for the engine comparison.

## Install

```sh
npm install @modplayjs/fmt-sid
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as sidPlugin, sidDsp, sidStartTune } from '@modplayjs/fmt-sid';

const core = new CorePlayer();
core.registries.registerFormat(sidPlugin);
core.registries.registerDsp(sidDsp);
core.loadModule(bytes);              // .sid file

// at playback start (engine is sample-paced, not tick-paced):
core.setDsp('sid');
core.setSampleRate(deviceRate);
core.startPlayer();
sidStartTune(bytes, deviceRate, 1);  // subtune 1
```

The engine renders through the `sid` DSP plugin at exact host-buffer
pacing; the tracker player just keeps the pipeline flowing. Loop
semantics: the stub module loops forever (`loop=0` in `playBuffer`).

## Settings

```ts
import { getSidSettings, applySidSettings } from '@modplayjs/fmt-sid';

applySidSettings({
  volume: 255,              // 0..255 engine master volume
  highQualitySID: true,     // oversampled waveform path (light = sample-rate)
  highQualityResampler: false, // Sinc FIR decimator (only with highQualitySID)
  stereo: 0,                // 0 mono / 1 stereo / 3 narrow (2SID+ tunes)
  model: 0,                 // 0 header default / 6581 / 8580 (forced)
  videoStandard: undefined, // undefined header default / 0 NTSC / 1 PAL
});
```

`volume`, `highQualitySID`, `highQualityResampler` and `stereo` apply
**live** (the engine reads them through its per-sample shadow sync, as in
the C host). `model` and `videoStandard` are **init-time** — they take
effect on the next `sidStartTune` call (the C player re-inits the tune for
these as well). `getSidSettings()` reads the current values back.

Note: `stereo` only routes differently on multi-SID tunes (PSID v3+ with
a SID2 address in the header) — single-SID tunes always play mono, so
`getSidChipCount()` lets players disable the control for them.

## Also exports

Full engine surface for direct use without the player core:
`cRSID_init`, `cRSID_initSIDtune`, `cRSID_generateSample`,
`cRSID_processSIDfileData`, `cRSID_playSIDtune`, `cRSID_pauseSIDtune`,
`cRSID_close`, plus the `cRSID`/`cRSID_C64` global objects for
inspection.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause for the
port; the underlying cRSID is WTF license by the original author (see
[NOTICE](../../NOTICE)).
