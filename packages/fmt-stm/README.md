# @modplayjs/fmt-stm

**Scream Tracker 2 (.stm) format plugin** for `@modplayjs/core`, ported
1:1 from libxmp's `stm_load.c` (ST2 tempo/semaphore semantics).

## Install

```sh
npm install @modplayjs/fmt-stm
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as stmPlugin } from '@modplayjs/fmt-stm';

const core = new CorePlayer();
core.registries.registerFormat(stmPlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
