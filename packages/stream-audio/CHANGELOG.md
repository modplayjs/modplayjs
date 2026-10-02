# @modplayjs/stream-audio

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

- [`9d03cb7`](https://github.com/modplayjs/modplayjs/commit/9d03cb7aad98b3a23d62a9584bab670897a2dcf3) - - build without prebuilt package dists (direct push)
- Updated dependencies [[`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`9d03cb7`](https://github.com/modplayjs/modplayjs/commit/9d03cb7aad98b3a23d62a9584bab670897a2dcf3), [`52bd665`](https://github.com/modplayjs/modplayjs/commit/52bd665ce637dba824af782b71b835f8e8e539c0), [`b0ee8ec`](https://github.com/modplayjs/modplayjs/commit/b0ee8eccb21e85a2c19315fd312d8afa5684ed4e)]:
  - @modplayjs/fmt-mo3@0.1.1
  - @modplayjs/stb-vorbis@0.1.1
