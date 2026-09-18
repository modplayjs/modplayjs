# @modplayjs/fmt-prowizard

## 0.2.1

### Patch Changes

- [#20](https://github.com/modplayjs/modplayjs/pull/20) [`6ede326`](https://github.com/modplayjs/modplayjs/commit/6ede326d00e07148664630019248f98400206857) Thanks [@Bitti09](https://github.com/Bitti09)! - publish all packages to npmjs.com — remove publishConfig redirects (PR [#20](https://github.com/modplayjs/modplayjs/issues/20), by @Bitti09)

## 0.2.0

### Minor Changes

- [#17](https://github.com/modplayjs/modplayjs/pull/17) [`07b1175`](https://github.com/modplayjs/modplayjs/commit/07b1175bae10e975b1740415722a2f1c26b0414a) Thanks [@Bitti09](https://github.com/Bitti09)! - Wave 2 — ProWizard packed-MOD depackers (20 packers) (PR [#17](https://github.com/modplayjs/modplayjs/issues/17), by @Bitti09)

- [#17](https://github.com/modplayjs/modplayjs/pull/17) [`280fcba`](https://github.com/modplayjs/modplayjs/commit/280fcbad00a1499a98dd187939f1c49b594d7bf5) Thanks [@Bitti09](https://github.com/Bitti09)! - Add ProWizard packed-MOD depackers: 20 packers ported from libxmp's
  prowizard library (ProPacker 1.0/2.1/3.0, The Player 4.x/5.0a/6.0a,
  Tracker Packer v1/v2/v3, UNIC Tracker id/noid/id0/2, NoisePacker
  v1/v2/v3, AC1D, Digital Illusions, Eureka, FC-M, Fuchs, Heatseeker,
  Hornet, Kefrens Sound Machine, Module Protector id/noID, SKYT, Wanton,
  XANN, Zen). Each depacker converts packed files to standard 31-sample
  M.K. MOD bytes parsed by the shared MOD core. Verified against libxmp's
  own golden module dumps (27 fixtures PASS) and 66 fuzzer fixtures
  rejected without crashes.
