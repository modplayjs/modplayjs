# @modplayjs/playhead

## 0.3.0

### Minor Changes

- [`e88c086`](https://github.com/modplayjs/modplayjs/commit/e88c08671c34db61a76b611e1b5c2f49cb5e24dd) - Add `@modplayjs/playhead`, a playback clock for UIs, and fix the pattern
  view running ahead of the audio.
  
  The renderer pulls `playBuffer` ahead of the speaker — `out-webaudio` keeps
  its SAB ring at a ~0.7 s high-water mark — so a view that reads
  `core.playState` showed a row that had not been heard yet (about four rows
  early on a 10-speed MOD). `Playhead` records (rendered frames, position)
  marks on every pull and answers a lookup at the frame the sink has actually
  consumed, resolving rows inside a multi-row pull from the core's tick model.
  `out-webaudio` now exposes `consumedFrames` / `deviceLatencyFrames` /
  `audibleFrames` and an `onRender` tap, and freezes the copy-mode estimate
  across pause.
  
  Verified with `tools/playhead-sync.mjs` (renders a module twice: exact
  per-tick ground truth vs. the playhead at 0–680 ms of pipeline depth —
  100% row-exact at every depth, where the previous reading was 4 rows early).

### Patch Changes

- [`1406b8d`](https://github.com/modplayjs/modplayjs/commit/1406b8ddc72178045274570b40a7aa86d2e905c3) - - sync the pattern view to the audible row, not the render head (direct push)
