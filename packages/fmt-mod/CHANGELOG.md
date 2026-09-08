# @modplayjs/fmt-mod

## 0.0.2

### Patch Changes

- [`d63c56f`](https://github.com/modplayjs/modplayjs/commit/d63c56f2eefc692aa78dd14b6738e648f1c43890) Thanks [@Bitti09](https://github.com/Bitti09)! - The effects processor moved from `@modplayjs/effects-shared` into
  `@modplayjs/core` (exported from the root), removing the core ↔
  effects-shared dependency cycle. `@modplayjs/effects-shared` remains as a
  compatibility shim that re-exports `@modplayjs/core`; the format plugins
  now depend only on `@modplayjs/core`.
- Updated dependencies [[`d63c56f`](https://github.com/modplayjs/modplayjs/commit/d63c56f2eefc692aa78dd14b6738e648f1c43890)]:
  - @modplayjs/core@0.1.0

## 0.0.1

### Patch Changes

- Initial release. Protracker format plugin: 15/31-sample MOD loader with NoiseTracker/FairLight quirks.
