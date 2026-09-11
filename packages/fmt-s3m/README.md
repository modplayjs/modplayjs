# @modplayjs/fmt-s3m

**Scream Tracker 3 (S3M) format plugin** for `@modplayjs/core`.

## Install

```sh
npm install @modplayjs/fmt-s3m
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as s3mPlugin } from '@modplayjs/fmt-s3m';

const core = new CorePlayer();
core.registries.registerFormat(s3mPlugin);
core.loadModule(bytes);   // .s3m file
```

Handles S3M semantics with libxmp parity: sample/pattern loops with S3M
loop mode, Amiga-style period slides, the S3M retrigger variant
(`S3MRTG`), fine effects, and the `S3M_END` order marker.

## Also exports

- `s3mExportPlugin` — write S3M modules back out.
- `s3mTest` / `s3mLoad` — direct loader access (signature identical to
  libxmp's format loaders).

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
