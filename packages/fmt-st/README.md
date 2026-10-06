# @modplayjs/fmt-st

**Ultimate Soundtracker (ST/UST) plugin** for `@modplayjs/core` — the
original 15-instrument MOD family, ported 1:1 from libxmp's `st_load.c`
with The Ultimate Soundtracker quirk handling.

## Install

```sh
npm install @modplayjs/fmt-st
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as stPlugin } from '@modplayjs/fmt-st';

const core = new CorePlayer();
core.registries.registerFormat(stPlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
