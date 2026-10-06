# @modplayjs/fmt-med

**MED / OctaMED (.med) format plugin** for `@modplayjs/core`, ported 1:1
from libxmp's MED loader family:

- MMD0/MMD1 (`mmd1_load.c`) — MED/OctaMED tracker modes
- MMD2/MMD3 (`mmd3_load.c`) — OctaMED Soundstudio
- MMDCommon (`mmd_common.c`) — shared instrument/sample decoding incl.
  the MED synth/hybrid instruments (MED V1–V5, IFFOCT/IFF5OCT wavelists)
- MED2/MED3/MED4 (`.med` 5/6/8-channel song variants, `med2/3/4_load.c`)

Playback includes the MED synth extras (arpeggios, wave/PSS commands,
hold/decay) through the shared extras engine.

## Install

```sh
npm install @modplayjs/fmt-med
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as medPlugin } from '@modplayjs/fmt-med';

const core = new CorePlayer();
core.registries.registerFormat(medPlugin);
core.loadModule(bytes);   // .med / .mmd0-.mmd3 / .med2-.med4
```

## Also exports

Plugins: `plugin` (MMD0/MMD1), `mmd3Plugin`, `med2Plugin`, `med3Plugin`,
`med4Plugin` — register each format you want to accept. Direct loaders:
`mmd1Test/Load`, `mmd3Test/Load`, `med2Test/Load`, `med3Test/Load`,
`med4Test/Load`, `mmdReadTitle`, plus `readEventMed` for the shared MED
event reader.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
