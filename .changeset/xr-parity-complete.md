---
'@modplayjs/xr': patch
---

Close the remaining panel parity gaps and tighten the spatial settings.

New panels: a queue panel (the playlist's order, tap a row to jump) and an
ignored-files panel with per-file restore. Both open from Settings, are
registered like the other panels and are hidden until asked for.

The pattern colour picker is in the Appearance section now: four swatches that
cycle the phone app's palette and wrap back to "theme colour", which avoids a
colour dialog that is awkward with a controller ray.

Spatial settings: the on/off choice persists across launches and is pushed to
the engine before the first module can load, so a module no longer opens in
stereo just because the toggle was set in a previous session. The section now
says when a module cannot be split into objects (SID/streamed) and otherwise
shows the object count, layout and where the positions come from.

Also removed the per-tick marker colour writes (colour is set at build time)
and the level-driven scale write from the ring update, so a ring change is two
transform writes per marker instead of five component writes.
