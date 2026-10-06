# @modplayjs/fmt-prowizard

**ProWizard packed-MOD depacker plugin** for `@modplayjs/core` — ported
1:1 from libxmp's `src/loaders/prowizard/`. Detects and converts ~30
classic Amiga tracker packers into playable modules:

PowerPacker (PP20), XPK, Starpack (Startrekker Packer), The Dark Demon,
Soundtracker packs (Ultimate Soundtracker variants, Ice Face The Music),
Tuning, Fuchs Tracker, FC-M, Eureka Packer, Hornet, Digital Illusions,
AC1D, JamCracker, ProPacker 1/2/3, The Player 1.0/2.0/3.0/4.0/5.0/6.0
(Titanics, Sketch, …), Zen, Ultra Soundtracker ID variants and more.

**30 of the C reference's 43 depackers are ported** (the remaining 11 —
pm18a, pm10c, prun1, prun2, pha, p61a, noiserun, novotrade/crb, tdd,
gmc, fuzzac — are listed as pending in `src/prowiz.ts`).

The no-signature probe order matches `prowiz.c`'s `pw_formats` array
(order is load-bearing). Loader parity is verified per depacker against
the C reference (`tools/pw-e2e.mjs`).

## Install

```sh
npm install @modplayjs/fmt-prowizard
```

## Usage

```ts
import { CorePlayer } from '@modplayjs/core';
import { pwPlugin } from '@modplayjs/fmt-prowizard';

const core = new CorePlayer();
core.registries.registerFormat(pwPlugin);
core.loadModule(bytes);   // packed .mod variants
```

## Also exports

`pwCheck`, `pwWizardry`, `pwFormats`, `pwReadTitle`, `type PwFormat`,
`pwTest`, `pwLoad`.

Part of the [modplayjs monorepo](../../README.md). BSD-3-Clause.
