# @modplayjs/fmt-mtm

**Multitracker (.mtm) format plugin** for `@modplayjs/core`, ported 1:1
from libxmp's `mtm_load.c`.

## Install

```sh
npm install @modplayjs/fmt-mtm
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as mtmPlugin } from '@modplayjs/fmt-mtm';

const core = new CorePlayer();
core.registries.registerFormat(mtmPlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
