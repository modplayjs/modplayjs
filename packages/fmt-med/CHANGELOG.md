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

- [`9bf0bd2`](https://github.com/modplayjs/modplayjs/commit/9bf0bd22a83d119c0b34190bf6819184c142ab18) - - package READMEs for all 15 undocumented packages + demo sidDsp fix (direct push)
- Updated dependencies [[`5448276`](https://github.com/modplayjs/modplayjs/commit/5448276055a8871b065370df8f9bc8dc5f3039af), [`c27226e`](https://github.com/modplayjs/modplayjs/commit/c27226e97c50323ac9e7a2c4a30f6b67d654fd14), [`74fa0f6`](https://github.com/modplayjs/modplayjs/commit/74fa0f6611cd2a4f9f484abbe013bc6636d1263d), [`6ca165d`](https://github.com/modplayjs/modplayjs/commit/6ca165d46bf1e46ca8c907728844da40c65a0198), [`c63a020`](https://github.com/modplayjs/modplayjs/commit/c63a02084c9d52e0ed4207d63df04f1487a51540), [`e1c17b8`](https://github.com/modplayjs/modplayjs/commit/e1c17b8a8df1e6ed4f8e6717bf8a6a1b0b031830), [`b3742a1`](https://github.com/modplayjs/modplayjs/commit/b3742a11e8255cf8b70aea0dad84226c98c4a9f1), [`4793c7e`](https://github.com/modplayjs/modplayjs/commit/4793c7e7eb46ef6201dd993874bb32fbe2236d23), [`b56f125`](https://github.com/modplayjs/modplayjs/commit/b56f1255bdfa2865e611f95e55c0cd80b513e78e), [`d095157`](https://github.com/modplayjs/modplayjs/commit/d095157010e6a7eb8b217f9079d00d3dabfdc13a), [`d6399d2`](https://github.com/modplayjs/modplayjs/commit/d6399d2511108f10ab8d97f8cf99386f275bd10e), [`62f1b15`](https://github.com/modplayjs/modplayjs/commit/62f1b15755e137eb110a598f8dfad1a0156389f8), [`ff0c4c7`](https://github.com/modplayjs/modplayjs/commit/ff0c4c74607974f23272cedc490de0eac7097713)]:
  - @modplayjs/core@0.2.0
