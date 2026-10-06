# @modplayjs/stream-audio

**Streamed-audio decode** for file-based playback (non-tracked formats):
whole-file WAV / MP3 / OGG decoding into PCM sources with the same
pull-playback contract as the player core, so `@modplayjs/out-webaudio`
drives them unchanged.

- **WAV**: PCM (16/8-bit) + IMA ADPCM (tag 0x11)
- **MP3**: via the minimp3 Layer-3 port from `@modplayjs/fmt-mo3`
- **OGG**: via the `@modplayjs/stb-vorbis` port
- Format sniffing includes tracker-magic fallback (a `.mod` mis-named
  `.wav` is detected as a module, not decoded as RIFF)

74 of 76 test-corpus streamed files decode (the remaining two use
Creative/G.723 ADPCM codecs).

## Install

```sh
npm install @modplayjs/stream-audio
```

## Usage

```ts
import { detectStreamedFormat, createStreamedSource } from '@modplayjs/stream-audio';

const fmt = detectStreamedFormat(bytes, filename);
if (fmt) {
  const src = createStreamedSource(bytes, fmt, deviceRate);
  // src exposes playBuffer(out, size, loop) — same pull semantics as CorePlayer
}
```

## Also exports

`decodeWav`, `parseWavHeader`, `decodeImaAdpcmWav`, `decodeMp3File`,
`decodeOggFile`, `type StreamedSource`, `type StreamedFormat`.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
