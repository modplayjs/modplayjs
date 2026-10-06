# @modplayjs/fmt-fc

**Future Composer 1.0–1.4 (.fc13/.fc14, SMOD) plugin** for
`@modplayjs/core`. The loader is a 1:1 port of OpenMPT's
`Load_fc.cpp` (header validation, playlist, pattern decode with
per-channel transposes, E0–EA script translation with the
volume-underflow quirk, built-in waveforms, SSMP sub-samples).

Playback drives the **InstrumentSynth engine port** (`synth.ts`) — the
same synth OpenMPT uses for FC/MED/GT2 scripts — through the core's
EffectPlugin hooks. Pitch mapping is exact (the FC pitch block reads the
loader NoteMap exactly like C) and all 20 test-corpus files load.

Known synth-engine deltas vs OpenMPT (swapSampleIndex bookkeeping,
MED_JumpScript sibling-state access) are tracked in
[docs/REMAINING-PARITY.md](../../docs/REMAINING-PARITY.md).

## Install

```sh
npm install @modplayjs/fmt-fc
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as fcPlugin, fcEffect } from '@modplayjs/fmt-fc';

const core = new CorePlayer();
core.registries.registerFormat(fcPlugin);
core.registries.registerEffect(fcEffect);
core.loadModule(bytes);   // .fc13 / .fc14
```

## Also exports

`fcTest` / `fcLoad`, `setModEventReader`, and the full synth-event
surface (`SynthState`, `ev*` command handlers) for reuse by other
script-driven formats.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
