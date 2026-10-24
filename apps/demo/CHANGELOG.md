# @modplayjs/demo

## 0.2.2

### Patch Changes

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
- Updated dependencies [[`55f9461`](https://github.com/modplayjs/modplayjs/commit/55f946152b9dfcdcfa956e01a479a70d5451eeea), [`de9d376`](https://github.com/modplayjs/modplayjs/commit/de9d3764d19b8479f03ae3bd6594c0f2242bd467), [`944a002`](https://github.com/modplayjs/modplayjs/commit/944a002b907224917dbae932af824c1d835b2b49), [`1406b8d`](https://github.com/modplayjs/modplayjs/commit/1406b8ddc72178045274570b40a7aa86d2e905c3), [`6dad01c`](https://github.com/modplayjs/modplayjs/commit/6dad01cc49d2481860459ee92dfe4a75582c9032), [`bec6175`](https://github.com/modplayjs/modplayjs/commit/bec6175ff939601e871a1898980776908c0332b7), [`e88c086`](https://github.com/modplayjs/modplayjs/commit/e88c08671c34db61a76b611e1b5c2f49cb5e24dd), [`14d86ba`](https://github.com/modplayjs/modplayjs/commit/14d86ba1e2457cc193700379d0881a695d4c1e47)]:
  - @modplayjs/core@0.2.2
  - @modplayjs/dsp-paula@0.2.2
  - @modplayjs/dsp-softmixer@0.2.2
  - @modplayjs/effects-shared@0.2.2
  - @modplayjs/fmt-669@0.2.2
  - @modplayjs/fmt-asylum@0.2.2
  - @modplayjs/fmt-digi@0.2.2
  - @modplayjs/fmt-fc@0.2.2
  - @modplayjs/fmt-ice@0.2.2
  - @modplayjs/fmt-it@0.2.2
  - @modplayjs/fmt-med@0.2.2
  - @modplayjs/fmt-mod@0.2.2
  - @modplayjs/fmt-mtm@0.2.2
  - @modplayjs/fmt-prowizard@0.2.2
  - @modplayjs/fmt-s3m@0.2.2
  - @modplayjs/fmt-sfx@0.2.2
  - @modplayjs/fmt-sid@0.2.2
  - @modplayjs/fmt-st@0.2.2
  - @modplayjs/fmt-stm@0.2.2
  - @modplayjs/fmt-xm@0.2.2
  - @modplayjs/out-pcm@0.2.2
  - @modplayjs/out-webaudio@0.3.0
  - @modplayjs/stream-audio@0.2.2
  - @modplayjs/playhead@0.3.0
