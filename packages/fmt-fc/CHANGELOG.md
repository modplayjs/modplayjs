# @modplayjs/fmt-fc

## 0.1.1

### Patch Changes

- [`2482721`](https://github.com/modplayjs/modplayjs/commit/2482721f3434f3fd34f55b15f84f914118f5ed53) - fmt-fc: synth state reconstruct on first tick only (chn.triggerNote parity); coverage report: known-gaps section (direct push)

- [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d) - - keygen-pack parity fixes (XM/IT/MOD), coverage-scan harness (direct push)
  - fmt-st: Ultimate Soundtracker loader (libxmp st_load.c port); S3M EOF-seek clamp (direct push)
  - fmt-mo3: MO3 container loader (OpenMPT Load_mo3.cpp port) + minimp3 L3 port (direct push)
  - fmt-fc: Future Composer 1.0-1.4 loader (OpenMPT Load_fc.cpp + InstrumentSynth port) (direct push)
  - stream-audio: WAV IMA ADPCM + module-magic sniffing (direct push)
  - fmt-fc: synth state reconstruct on first tick only (chn.triggerNote parity); coverage report: known-gaps section (direct push)
  - cover all commits since the last changeset run (direct push)
  - dispatch rerun re-covers the last push window (direct push)

- [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198) - - fmt-fc: exact FC pitch block, raw-note playback, queued sample swap (direct push)

- [`3a26cef`](https://github.com/modplayjs/modplayjs/commit/3a26cef0b5f3cc30ba7b94412081fbf9693bf06c) - - fmt-fc: implement the remaining FTM/MED synth stubs (direct push)
- Updated dependencies [[`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af), [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14), [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198), [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540), [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713)]:
  - @modplayjs/core@0.2.0
  - @modplayjs/fmt-mod@0.1.1
