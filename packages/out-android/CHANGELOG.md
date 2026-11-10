# @modplayjs/out-android

## 0.3.1

### Patch Changes

- [`794091b`](https://github.com/modplayjs/modplayjs/commit/794091b0cc48788d2e611fc7ae6a6cbf4fb5abf5) - - publish to npmjs.com and GitHub Packages (direct push)

- [`d451516`](https://github.com/modplayjs/modplayjs/commit/d45151611ed82f9a4e5558fdddab9e842c2fb52f) - XR shell rewrite and audio fixes.
  
  - Panels are created and destroyed with their visibility (at most five live),
    and their Compose views are disposed with them. Hidden panels used to keep a
    virtual display and a compositor layer each.
  - Channel labels are `Text3D` meshes instead of 32 Compose panels. Marker mode
    no longer opens 40 compositor layers, which was the slideshow.
  - One layout table (`SpatialLayout`): 360 starts channel 1 at front-left, the
    Amiga layouts use the ±45/±135 quad, and the engine reports raw pans only.
  - Panels live in a head-captured stage frame. Walking, turning, a track change
    or a room load no longer moves them; a mode switch, recenter, reset or a
    sustained body-posture change rebases the whole arrangement rigidly. Free
    poses are stored relative to the stage, so they come along instead of being
    wiped.
  - Ring follow is a three-way mode: world, the experimental live "sticky"
    position follow (world yaw kept), and the old head-locked follow.
  - New `spatial3d` layout: a 32-point bus dome (10/35/60 deg tiers) with a 3D
    kernel panner in the native mixer, and channels spiralling from 8 to 68 deg
    elevation on a golden angle, with the module pan offsetting the azimuth. The
    engine bus directions are sent to the panner, so markers and sound share one
    point.
  - Snapshot parsing and settings persistence moved off the V8/audio thread.
  - SID chip model and video standard now reach the tune init (they only
    restarted the tune before). Voices is capped at 64, which is what the engine
    accepts. Stereo Paula layouts only hard-pan for LRLR/LRRL.

## 0.3.0

### Minor Changes

- [`9a5b520`](https://github.com/modplayjs/modplayjs/commit/9a5b520422da7ffa7e38efb00b82823d7fdee22a) - - native Android 15 player with prebuilt V8 JIT (direct push)

- [`51f642a`](https://github.com/modplayjs/modplayjs/commit/51f642a90121f396e7e91933db7a8df37b2e2a39) - - engine reports what it can play, and a change rescans (direct push)

- [`ed0cca6`](https://github.com/modplayjs/modplayjs/commit/ed0cca6f9804e1e835766b6f1b8cdd9b875245db) - - realtime pattern view (direct push)

- [`4a28396`](https://github.com/modplayjs/modplayjs/commit/4a2839629cb6cdb6b35df79a0c46467dec2cc80d) - - Meta Quest 3 spatial player (direct push)

- [`42036bf`](https://github.com/modplayjs/modplayjs/commit/42036bfec68d0370ee91cc0a3e6c62f5018398e1) - - row-accurate playhead polling for the pattern view (direct push)

- [`7f5eb0c`](https://github.com/modplayjs/modplayjs/commit/7f5eb0c092efd5f37a88e3d723601b16bf7f7cc5) - Spatial stems and the XR host contract.
  
  The soft mixer gained a `spatial` mode that mixes every module channel into its
  own mono bus before panning; the stereo path is unchanged. The Android engine
  entry exposes it as `renderSpatial()` plus the `setSpatial` and `spatialInfo`
  commands, with the file layout (`panned`, `lrlr`, `lrrl`) and per-channel pan
  mapped to azimuths. `@modplayjs/out-android` carries the two new command names.

### Patch Changes

- [`c1556b9`](https://github.com/modplayjs/modplayjs/commit/c1556b9a59aed7610dd83078e08a505aab80949c) - XR performance pass.
  
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
