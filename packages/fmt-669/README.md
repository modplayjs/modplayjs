# @modplayjs/fmt-669

**Composer 669 / UNIS 669 format plugin** for `@modplayjs/core` —
load-and-play support for the 669 module family (8 channels, linear
sample tracking, 669/UNIS effect sets), ported 1:1 from libxmp's
`669_load.c`.

## Install

```sh
npm install @modplayjs/fmt-669
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as s69Plugin } from '@modplayjs/fmt-669';

const core = new CorePlayer();
core.registries.registerFormat(s69Plugin);
core.loadModule(bytes);   // .669 file
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
