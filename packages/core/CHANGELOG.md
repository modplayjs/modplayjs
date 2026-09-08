# @modplayjs/core

## 0.1.0

### Minor Changes

- [`d63c56f`](https://github.com/modplayjs/modplayjs/commit/d63c56f2eefc692aa78dd14b6738e648f1c43890) Thanks [@Bitti09](https://github.com/Bitti09)! - The effects processor moved from `@modplayjs/effects-shared` into
  `@modplayjs/core` (exported from the root), removing the core ↔
  effects-shared dependency cycle. `@modplayjs/effects-shared` remains as a
  compatibility shim that re-exports `@modplayjs/core`; the format plugins
  now depend only on `@modplayjs/core`.

## 0.0.1

### Patch Changes

- Initial release. Core player engine: module loading (MOD/S3M/XM/IT), sequencer with libxmp-parity scan and flow control, virtual channel management, sample store, and the effect-processing core ported from libxmp.
