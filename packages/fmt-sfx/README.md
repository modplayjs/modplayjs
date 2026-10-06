# @modplayjs/fmt-sfx

**SoundFX (.sfx) format plugin** for `@modplayjs/core`, ported 1:1 from
libxmp's `sfx_load.c` (4/8-channel SoundFX 1.x/2.0 modules).

## Install

```sh
npm install @modplayjs/fmt-sfx
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as sfxPlugin } from '@modplayjs/fmt-sfx';

const core = new CorePlayer();
core.registries.registerFormat(sfxPlugin);
core.loadModule(bytes);
```

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
