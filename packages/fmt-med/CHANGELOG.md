# @modplayjs/fmt-med

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

- [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14) - Add MED/OctaMED format family (fmt-med) + MED runtime in core (direct push)
- Updated dependencies [[`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af), [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14), [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198), [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540), [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713)]:
  - @modplayjs/core@0.2.0
