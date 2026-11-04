---
'@modplayjs/xr': patch
---

Make the pattern view follow the music instead of stuttering.

The playhead used to arrive with the full snapshot at 2 Hz. At 125 BPM speed 6 a
tracker row lasts ~120 ms, so the grid jumped four rows at a time, half a second
apart — that is the stutter.

The engine gains a `playhead` command: `playing`, `paused`, `ended`,
`positionMs`, `ord`, `row`, `pattern`. A few numbers, no track object, no
instrument or sample lists. `XrPlayer` polls it every 120 ms while playing and
publishes only the row/pattern fields, so the grid advances one row per step.
The full snapshot stays at 2 Hz because every panel recomposes on it.

On the panel side: the dot-stripping regex is built once instead of per cell,
`LazyColumn` has no item animation (the playhead moves 8x/s), and the panel gets
`resolutionScale = 1.4` — 1764 px, still under the 2064 px eye buffer, which
makes 7 sp monospace cells readable.
