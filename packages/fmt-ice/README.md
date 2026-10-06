# @modplayjs/fmt-ice

**Soundtracker 2.6 / Ice Tracker (.mod with MTN/IT10 signatures) plugin**
for `@modplayjs/core`, ported 1:1 from libxmp's `ice_load.c`.

## Install

```sh
npm install @modplayjs/fmt-ice
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as icePlugin } from '@modplayjs/fmt-ice';

const core = new CorePlayer();
core.registries.registerFormat(icePlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
