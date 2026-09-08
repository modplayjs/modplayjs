# @modplayjs/dsp-softmixer

## 0.0.2

### Patch Changes

- Stereo-sample mixing: samples with the STEREO flag now play through libxmp's `stereoout_stereo` mixers — L/R read as an interleaved pair, interpolation strides by channel count, and the R channel keeps its own lowpass-filter history. Previously every sample was mixed as mono-source (L duplicated to R), which broke modules with stereo samples (e.g. `stereo.xm`, correlation with the C reference 0.05 → 0.999).
- Updated dependencies []:
  - @modplayjs/core@0.0.2
