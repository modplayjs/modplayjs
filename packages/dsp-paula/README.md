# @modplayjs/dsp-paula

Amiga **Paula-emulating mixer** DSP plugin for `@modplayjs/core` — a
cycle-counted Paula channel model for MOD playback (LED filter, period
raster, `PAULA_FREQUENCY` = 3.546895 MHz clock), matching the
Paula-Tracker reference player.

## Install

```sh
npm install @modplayjs/dsp-paula
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as modPlugin } from '@modplayjs/fmt-mod';
import { createPaulaPlugin } from '@modplayjs/dsp-paula';

const core = new CorePlayer();
core.registries.registerFormat(modPlugin);
core.registries.registerDsp(createPaulaPlugin());

core.loadModule(bytes);
core.setDsp('paula');
core.startPlayer();
```

Also exports `PAULA_FREQUENCY` and `periodToRate()` for tools that need
the raw Paula period math.

For S3M/XM/IT use
[`@modplayjs/dsp-softmixer`](https://www.npmjs.com/package/@modplayjs/dsp-softmixer)
instead (libxmp-parity software mixer with interpolation, filters and
anticlick).

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
