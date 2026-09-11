# @modplayjs/effects-shared

Shared effect-processing stages for modplayjs — the frame-accurate port of
libxmp's effect handlers (`effects.c`) and per-tick channel stages
(`player.c`'s process_volume / process_frequency / process_pan), shared by
all format plugins.

> **Compatibility shim:** the implementation lives in
> [`@modplayjs/core`](https://www.npmjs.com/package/@modplayjs/core)
> (`packages/core/src/effects/`); this package re-exports it so format
> plugins can depend on the effects package without pulling core directly.

## Install

```sh
npm install @modplayjs/effects-shared
```

It is a peer/consumer of `@modplayjs/core` — you normally don't add it
yourself; the format plugins (`fmt-mod`, `fmt-s3m`, `fmt-xm`, `fmt-it`)
depend on it for their event decoding (`readEventMod`, `readEventSt3`,
`readEventFt2`, `readEventIt`) and the shared tick stages.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
