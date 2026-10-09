# @modplayjs/fmt-mod

## 0.1.1

### Patch Changes

- [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d) - - keygen-pack parity fixes (XM/IT/MOD), coverage-scan harness (direct push)
  - fmt-st: Ultimate Soundtracker loader (libxmp st_load.c port); S3M EOF-seek clamp (direct push)
  - fmt-mo3: MO3 container loader (OpenMPT Load_mo3.cpp port) + minimp3 L3 port (direct push)
  - fmt-fc: Future Composer 1.0-1.4 loader (OpenMPT Load_fc.cpp + InstrumentSynth port) (direct push)
  - stream-audio: WAV IMA ADPCM + module-magic sniffing (direct push)
  - fmt-fc: synth state reconstruct on first tick only (chn.triggerNote parity); coverage report: known-gaps section (direct push)
  - cover all commits since the last changeset run (direct push)
  - dispatch rerun re-covers the last push window (direct push)

- [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540) - - deep-parity fixes across the 4 base formats (full-pack sweep) (direct push)

- [`f68aff9`](https://github.com/modplayjs/modplayjs/commit/f68aff960fb0d5f1ea203093197aa36ea3e0992a) - - update the toolchain to the latest (ts7, vite 8, turbo 2.11) (direct push)
- Updated dependencies [[`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af), [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14), [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198), [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540), [`e1c17b8`](https://github.com/modplayjs/modplayjs/commit/e1c17b8a8df1e6ed4f8e6717bf8a6a1b0b031830), [`b3742a1`](https://github.com/modplayjs/modplayjs/commit/b3742a11e8255cf8b70aea0dad84226c98c4a9f1), [`4793c7e`](https://github.com/modplayjs/modplayjs/commit/4793c7e7eb46ef6201dd993874bb32fbe2236d23), [`b56f125`](https://github.com/modplayjs/modplayjs/commit/b56f1255bdfa2865e611f95e55c0cd80b513e78e), [`d095157`](https://github.com/modplayjs/modplayjs/commit/d095157010e6a7eb8b217f9079d00d3dabfdc13a), [`d6399d2`](https://github.com/modplayjs/modplayjs/commit/d6399d2511108f10ab8d97f8cf99386f275bd10e), [`62f1b15`](https://github.com/modplayjs/modplayjs/commit/62f1b15755e137eb110a598f8dfad1a0156389f8), [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713)]:
  - @modplayjs/core@0.2.0

## 0.2.0

### Minor Changes

- [#23](https://github.com/modplayjs/modplayjs/pull/23) [`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44) Thanks [@Bitti09](https://github.com/Bitti09)! - switch entirely to GitHub Packages (drop npmjs.com) (PR [#23](https://github.com/modplayjs/modplayjs/issues/23), by @Bitti09)

### Patch Changes

- Updated dependencies [[`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44)]:
  - @modplayjs/core@0.2.0

## 0.1.0

### Minor Changes

- [#14](https://github.com/modplayjs/modplayjs/pull/14) [`aa07c7a`](https://github.com/modplayjs/modplayjs/commit/aa07c7ac534e9309f2861a0d9d54962ff5f7fc1d) Thanks [@Bitti09](https://github.com/Bitti09)! - depacked-MOD parse core (pw_load port) + format roadmap (PR [#14](https://github.com/modplayjs/modplayjs/issues/14), by @Bitti09)

- [#15](https://github.com/modplayjs/modplayjs/pull/15) [`8d015f2`](https://github.com/modplayjs/modplayjs/commit/8d015f272b5fbaeb5679a448535095c58c3eee0a) Thanks [@Bitti09](https://github.com/Bitti09)! - Wave 1 — seven MOD-family format plugins (MTM/STM/669/SFX/DIGI/Asylum/Ice) (PR [#15](https://github.com/modplayjs/modplayjs/issues/15), by @Bitti09)

### Patch Changes

- Updated dependencies [[`aa07c7a`](https://github.com/modplayjs/modplayjs/commit/aa07c7ac534e9309f2861a0d9d54962ff5f7fc1d), [`8d015f2`](https://github.com/modplayjs/modplayjs/commit/8d015f272b5fbaeb5679a448535095c58c3eee0a)]:
  - @modplayjs/core@0.1.0

## 0.0.1

### Patch Changes

- Initial release. Protracker format plugin: 15/31-sample MOD loader with NoiseTracker/FairLight quirks.
