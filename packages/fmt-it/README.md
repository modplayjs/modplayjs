# @modplayjs/fmt-it

**Impulse Tracker (IT) format plugin** for `@modplayjs/core` — the most
feature-heavy loader in the family:

- IT214 / IT215 sample decompression (`itsex.ts`, bit-exact port)
- Full NNA / DCA / DCT new-note-action semantics
- IT envelope susloops, note delay, pattern loops
- MIDI macro configuration (`MIDI.XML`-style CC/NNA macros)
- OpenMPT compatibility flags (MPT preamp, extended sample options)
- CHBI compressed patterns

## Install

```sh
npm install @modplayjs/fmt-it
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { plugin as itPlugin } from '@modplayjs/fmt-it';

const core = new CorePlayer();
core.registries.registerFormat(itPlugin);
core.loadModule(bytes);   // .it file
```

## Also exports

- `itExportPlugin` — write IT modules back out.
- `itTest` / `itLoad` — direct loader access.
- `applyMptPreamp` — OpenMPT preamp compatibility helper.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
