# @modplayjs/dsp-softmixer

## 0.1.1

### Patch Changes

- [`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af) - dead config knobs wired, IT volcol slide memory, scan uint8 wrap; docs refreshed (direct push)

- [`d095157`](https://github.com/modplayjs/modplayjs/commit/d095157010e6a7eb8b217f9079d00d3dabfdc13a) - - dsp-softmixer: exact libxmp integer mixing domain + A500 Paula BLEP mode, L/R layouts; deprecate dsp-paula (direct push)

- [`a780ae2`](https://github.com/modplayjs/modplayjs/commit/a780ae25572a96e595af539d8769549ac900813d) - - dsp-softmixer: per-tick adjustVoiceEnd — fixes all 4 IT mixer-data goldens (direct push)

- [`e6cc784`](https://github.com/modplayjs/modplayjs/commit/e6cc784a93b24860ad264d438a66b3d6042b3692) - - dsp-softmixer: anticlick uses uint32 square wrap + arithmetic shift (C parity) (direct push)

- [`fe9214a`](https://github.com/modplayjs/modplayjs/commit/fe9214a4089dff7730d322b0d25dafe26bc5e2a4) - - dsp-softmixer: remove investigation instrumentation (direct push)

- [`750ab0a`](https://github.com/modplayjs/modplayjs/commit/750ab0ad8012225a9380820367891a0dd9224ae5) - - dsp-softmixer/demo: gate the Paula mode to 4-channel Amiga MODs; hard-pan only in Paula mode (direct push)

- [`0bfdcf6`](https://github.com/modplayjs/modplayjs/commit/0bfdcf6ee3908ab1e9fed21b6e730fccf0d9a159) - - dsp-softmixer: skip voices with smp -1 — the seek crash that killed playback (direct push)

- [`f68aff9`](https://github.com/modplayjs/modplayjs/commit/f68aff960fb0d5f1ea203093197aa36ea3e0992a) - - update the toolchain to the latest (ts7, vite 8, turbo 2.11) (direct push)
- Updated dependencies [[`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af), [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14), [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198), [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540), [`e1c17b8`](https://github.com/modplayjs/modplayjs/commit/e1c17b8a8df1e6ed4f8e6717bf8a6a1b0b031830), [`b3742a1`](https://github.com/modplayjs/modplayjs/commit/b3742a11e8255cf8b70aea0dad84226c98c4a9f1), [`4793c7e`](https://github.com/modplayjs/modplayjs/commit/4793c7e7eb46ef6201dd993874bb32fbe2236d23), [`b56f125`](https://github.com/modplayjs/modplayjs/commit/b56f1255bdfa2865e611f95e55c0cd80b513e78e), [`d095157`](https://github.com/modplayjs/modplayjs/commit/d095157010e6a7eb8b217f9079d00d3dabfdc13a), [`d6399d2`](https://github.com/modplayjs/modplayjs/commit/d6399d2511108f10ab8d97f8cf99386f275bd10e), [`62f1b15`](https://github.com/modplayjs/modplayjs/commit/62f1b15755e137eb110a598f8dfad1a0156389f8), [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713)]:
  - @modplayjs/core@0.2.0

## 0.1.0

### Minor Changes

- [#23](https://github.com/modplayjs/modplayjs/pull/23) [`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44) Thanks [@Bitti09](https://github.com/Bitti09)! - switch entirely to GitHub Packages (drop npmjs.com) (PR [#23](https://github.com/modplayjs/modplayjs/issues/23), by @Bitti09)

### Patch Changes

- Updated dependencies [[`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44)]:
  - @modplayjs/core@0.2.0

## 0.0.4

### Patch Changes

- Updated dependencies [[`aa07c7a`](https://github.com/modplayjs/modplayjs/commit/aa07c7ac534e9309f2861a0d9d54962ff5f7fc1d), [`8d015f2`](https://github.com/modplayjs/modplayjs/commit/8d015f272b5fbaeb5679a448535095c58c3eee0a)]:
  - @modplayjs/core@0.1.0

## 0.0.1

### Patch Changes

- Initial release. Software mixer DSP: libxmp soft_mixer port with nearest/linear/spline interpolation, bidirectional loops, IT lowpass filter, anticlick ramps, and stereo-sample support.
