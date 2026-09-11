# @modplayjs/fmt-xm

**Fasttracker II Extended Module (XM) format plugin** for
`@modplayjs/core` — FT2 playback semantics, 4/8-bit ADPCM sample
decompression and Ogg Vorbis pattern data (MDV-loading), with
libxmp-parity quirk sets (`FT2BUGS`, envelope quirks, …).

Ogg-compressed samples decode via the bundled
[`stb-vorbis`](https://www.npmjs.com/package/stb-vorbis) port.

## Install

```sh
npm install @modplayjs/fmt-xm
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as xmPlugin } from '@modplayjs/fmt-xm';

const core = new CorePlayer();
core.registries.registerFormat(xmPlugin);
core.loadModule(bytes);   // .xm file
```

## Also exports

- `xmExportPlugin` — write XM modules back out.
- `xmTest` / `xmLoad` — direct loader access.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
