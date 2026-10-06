# @modplayjs/fmt-digi

**DIGI Booster (.digi) plugin** for `@modplayjs/core`, ported 1:1 from
libxmp's `digi_load.c` (4/8-channel tracker with per-sample volume
envelopes).

## Install

```sh
npm install @modplayjs/fmt-digi
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as digiPlugin } from '@modplayjs/fmt-digi';

const core = new CorePlayer();
core.registries.registerFormat(digiPlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
