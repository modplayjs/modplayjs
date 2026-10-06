# @modplayjs/stb-vorbis

**Ogg Vorbis decoder** — a 1:1 TypeScript port of stb_vorbis.c from the
OpenMPT reference bundle (`reference/openmpt/include/stb_vorbis/`).

**Verified bit-exact** against the compiled C reference: max sample
difference 4.8e-7 over a 1.33-million-frame render, byte-identical int16
output across the full test corpus.

Used by `@modplayjs/fmt-mo3` (MO3 v5 Ogg-compressed samples, incl.
shared-Ogg-header remux) and `@modplayjs/stream-audio` (.ogg files).

## Install

```sh
npm install @modplayjs/stb-vorbis
```

## Usage

```ts
import { stbVorbisOpenMemory, stbVorbisGetFrameFloat } from '@modplayjs/stb-vorbis';

const v = stbVorbisOpenMemory(bytes);
// then pull interleaved float frames per audio block
```

stb_vorbis is public domain (Sean Barrett); see [NOTICE](../../NOTICE).

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause for the
port.
