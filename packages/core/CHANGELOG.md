# @modplayjs/core

## 0.2.0

### Minor Changes

- [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713) - Add MED/OctaMED (.med) format family: MMD0/MMD1/MMDC (MED 2.10 / OctaMED),
  MMD2/MMD3 (OctaMED Soundstudio), and MED2/MED3/MED4 song formats, ported
  from libxmp mmd_common.c, mmd1_load.c, mmd3_load.c, med2/3/4_load.c.
  
  Core gains MED runtime support: READ_EVENT_MED event reader (read_event_med),
  MED synth wavetable instruments + hold/decay (med_extras.c), FX_VIBRATO2 /
  FX_MED_RETRIG / FX_MED_HOLD effects, MED retrigger-delay handling in
  check_delay, and the MED row_limit (3200) in the scanner. LoadCtx gains an
  externalInstrument resolver for song formats that reference sample files
  (med_load_external_instrument).

### Patch Changes

- [`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af) - dead config knobs wired, IT volcol slide memory, scan uint8 wrap; docs refreshed (direct push)

- [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14) - Add MED/OctaMED format family (fmt-med) + MED runtime in core (direct push)

- [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d) - - keygen-pack parity fixes (XM/IT/MOD), coverage-scan harness (direct push)
  - fmt-st: Ultimate Soundtracker loader (libxmp st_load.c port); S3M EOF-seek clamp (direct push)
  - fmt-mo3: MO3 container loader (OpenMPT Load_mo3.cpp port) + minimp3 L3 port (direct push)
  - fmt-fc: Future Composer 1.0-1.4 loader (OpenMPT Load_fc.cpp + InstrumentSynth port) (direct push)
  - stream-audio: WAV IMA ADPCM + module-magic sniffing (direct push)
  - fmt-fc: synth state reconstruct on first tick only (chn.triggerNote parity); coverage report: known-gaps section (direct push)
  - cover all commits since the last changeset run (direct push)
  - dispatch rerun re-covers the last push window (direct push)

- [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198) - - fmt-fc: exact FC pitch block, raw-note playback, queued sample swap (direct push)

- [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540) - - deep-parity fixes across the 4 base formats (full-pack sweep) (direct push)

## 0.2.0

### Minor Changes

- [#23](https://github.com/modplayjs/modplayjs/pull/23) [`d72eb75`](https://github.com/modplayjs/modplayjs/commit/d72eb75b50d59cd771d062d34235c4a4feb49c44) Thanks [@Bitti09](https://github.com/Bitti09)! - switch entirely to GitHub Packages (drop npmjs.com) (PR [#23](https://github.com/modplayjs/modplayjs/issues/23), by @Bitti09)

## 0.1.0

### Minor Changes

- [#14](https://github.com/modplayjs/modplayjs/pull/14) [`aa07c7a`](https://github.com/modplayjs/modplayjs/commit/aa07c7ac534e9309f2861a0d9d54962ff5f7fc1d) Thanks [@Bitti09](https://github.com/Bitti09)! - depacked-MOD parse core (pw_load port) + format roadmap (PR [#14](https://github.com/modplayjs/modplayjs/issues/14), by @Bitti09)

- [#15](https://github.com/modplayjs/modplayjs/pull/15) [`8d015f2`](https://github.com/modplayjs/modplayjs/commit/8d015f272b5fbaeb5679a448535095c58c3eee0a) Thanks [@Bitti09](https://github.com/Bitti09)! - Wave 1 — seven MOD-family format plugins (MTM/STM/669/SFX/DIGI/Asylum/Ice) (PR [#15](https://github.com/modplayjs/modplayjs/issues/15), by @Bitti09)

## 0.0.1

### Patch Changes

- Initial release. Core player engine: module loading (MOD/S3M/XM/IT), sequencer with libxmp-parity scan and flow control, virtual channel management, sample store, and the effect-processing core ported from libxmp.
