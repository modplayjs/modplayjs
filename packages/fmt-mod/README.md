# @modplayjs/fmt-mod

ProTracker / SoundTracker / NoiseTracker **MOD format plugin** for
`@modplayjs/core` — one of libxmp's most format-agnostic loaders, covering
19 tracker variants with per-variant quirk mapping.

## Install

```sh
npm install @modplayjs/fmt-mod
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.loadModule(bytes);   // .mod file
```

The loader auto-detects the variant (ProTracker, NoiseTracker, TakeTracker,
Digital Tracker, OpenMPT-converted, SoundTracker, and more — see
`src/tracker.ts`) and maps each to its matching playback quirks (vibrato
rules, loop semantics, pan handling).

## Also exports

- `modExportPlugin` — write modules back out (used by the studio's export).
- `readEventMod`, `setPatch` — the MOD-specific event decoder, exported for
  tools that want to replay tracker events against the core directly.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
