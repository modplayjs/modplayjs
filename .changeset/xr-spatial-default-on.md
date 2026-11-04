---
'@modplayjs/xr': patch
---

Make spatial audio actually start on by default.

The preference already defaulted to on (`DEFAULT_SPATIAL = true`), but two things
could still show and play stereo:

- the panel state started at `spatialEnabled = false` until the first module
  published a snapshot, so Settings said "Off" on a fresh start;
- the engine's own `spatialEnabled` starts `false`, so if the single `setSpatial`
  command from `start()` raced the isolate startup, the engine stayed in stereo
  and `readSpatialInfo()` reported `enabled=false` back to the UI.

The state now initialises from the stored preference before anything loads, and
`rebuildOutputs()` re-asserts the choice on every output rebuild, so the engine
and the UI cannot drift apart. A stored off still wins, and modules the engine
cannot split (SID, streamed audio) still fall back to stereo.
