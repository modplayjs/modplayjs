# @modplayjs/fmt-asylum

**Asylum Music Format v1.0 (.amf/.asylum) plugin** for `@modplayjs/core`,
ported 1:1 from libxmp's `asylum_load.c`.

## Install

```sh
npm install @modplayjs/fmt-asylum
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as asylumPlugin } from '@modplayjs/fmt-asylum';

const core = new CorePlayer();
core.registries.registerFormat(asylumPlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
