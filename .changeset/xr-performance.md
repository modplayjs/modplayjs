---
'@modplayjs/xr': patch
'@modplayjs/dsp-softmixer': patch
'@modplayjs/out-android': patch
---

XR performance pass.

The audio thread no longer wakes 250 times a second when idle, runs at audio
priority instead of outranking the compositor, and caps the state publish rate
at 2 Hz while playing and 1 Hz while paused. Pattern cells are cached per
pattern instead of re-parsed every tick, spatial azimuths are no longer polled
every tick, and marker scaling only touches entities whose level actually
moved. Panel-side: the visibility/layout pass is skipped unless something the
panels show changed, the volume slider commits once per drag, library filtering
and sorting are memoised, favourites are read once per recompose, and the JNI
render path copies audio straight from the V8 backing store instead of through
a temporary vector.
