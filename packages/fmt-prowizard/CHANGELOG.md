# @modplayjs/fmt-prowizard

## 0.2.2

### Patch Changes

- [`55f9461`](https://github.com/modplayjs/modplayjs/commit/55f946152b9dfcdcfa956e01a479a70d5451eeea) - - Merge pull request [#27](https://github.com/modplayjs/modplayjs/issues/27) from modplayjs/changeset-release/main (direct push)
- Updated dependencies [[`55f9461`](https://github.com/modplayjs/modplayjs/commit/55f946152b9dfcdcfa956e01a479a70d5451eeea)]:
  - @modplayjs/core@0.2.2
  - @modplayjs/fmt-mod@0.2.2

## 0.1.1

### Patch Changes

- [`9bf0bd2`](https://github.com/modplayjs/modplayjs/commit/9bf0bd22a83d119c0b34190bf6819184c142ab18) - - package READMEs for all 15 undocumented packages + demo sidDsp fix (direct push)
- Updated dependencies [[`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af), [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14), [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198), [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540), [`e1c17b8`](https://github.com/modplayjs/modplayjs/commit/e1c17b8a8df1e6ed4f8e6717bf8a6a1b0b031830), [`b3742a1`](https://github.com/modplayjs/modplayjs/commit/b3742a11e8255cf8b70aea0dad84226c98c4a9f1), [`4793c7e`](https://github.com/modplayjs/modplayjs/commit/4793c7e7eb46ef6201dd993874bb32fbe2236d23), [`b56f125`](https://github.com/modplayjs/modplayjs/commit/b56f1255bdfa2865e611f95e55c0cd80b513e78e), [`d095157`](https://github.com/modplayjs/modplayjs/commit/d095157010e6a7eb8b217f9079d00d3dabfdc13a), [`d6399d2`](https://github.com/modplayjs/modplayjs/commit/d6399d2511108f10ab8d97f8cf99386f275bd10e), [`62f1b15`](https://github.com/modplayjs/modplayjs/commit/62f1b15755e137eb110a598f8dfad1a0156389f8), [`f68aff9`](https://github.com/modplayjs/modplayjs/commit/f68aff960fb0d5f1ea203093197aa36ea3e0992a), [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713)]:
  - @modplayjs/core@0.2.0
  - @modplayjs/fmt-mod@0.1.1

## 0.3.0

### Minor Changes

- [#23](https://github.com/modplayjs/modplayjs/pull/23) [`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44) Thanks [@Bitti09](https://github.com/Bitti09)! - switch entirely to GitHub Packages (drop npmjs.com) (PR [#23](https://github.com/modplayjs/modplayjs/issues/23), by @Bitti09)

### Patch Changes

- Updated dependencies [[`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44)]:
  - @modplayjs/core@0.2.0
  - @modplayjs/fmt-mod@0.2.0

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
