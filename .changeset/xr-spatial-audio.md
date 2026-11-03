---
'@modplayjs/dsp-softmixer': minor
'@modplayjs/out-android': minor
---

Spatial stems and the XR host contract.

The soft mixer gained a `spatial` mode that mixes every module channel into its
own mono bus before panning; the stereo path is unchanged. The Android engine
entry exposes it as `renderSpatial()` plus the `setSpatial` and `spatialInfo`
commands, with the file layout (`panned`, `lrlr`, `lrrl`) and per-channel pan
mapped to azimuths. `@modplayjs/out-android` carries the two new command names.
