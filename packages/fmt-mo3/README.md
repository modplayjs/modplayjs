# @modplayjs/fmt-mo3

**Un4seen MO3 container plugin** for `@modplayjs/core` — MO3 v1–v5
wrapping XM/IT/S3M/MOD/MTM inner formats. Ported 1:1 from OpenMPT's
`Load_mo3.cpp` plus unmo3's LZ depacker:

- Container + Lempel-Ziv depacker: **byte-exact** vs the C reference
- Uncompressed / delta / delta-prediction samples: exact decoders
- **Ogg-compressed samples: bit-exact** via `@modplayjs/stb-vorbis`
  (incl. MO3 v5 shared-Ogg-header remux)
- MP3-compressed samples via the bundled minimp3 Layer-3 port (correct
  playback; decoder-internal rounding differs from the C reference's
  mpg123 path)
- OpenMPT semantic glue: effTrans CMD table, envelope mapping, note
  conventions, InstrumentSynth pitch mapping

## Install

```sh
npm install @modplayjs/fmt-mo3
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as mo3Plugin } from '@modplayjs/fmt-mo3';

const core = new CorePlayer();
core.registries.registerFormat(mo3Plugin);
core.loadModule(bytes);   // .mo3 file
```

## Also exports

`mp3decInit` / `mp3decDecodeFrame` — the raw minimp3 L3 decoder (used by
`@modplayjs/stream-audio` for MP3 files).

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
