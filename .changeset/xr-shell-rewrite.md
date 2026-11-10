---
'@modplayjs/xr': minor
'@modplayjs/fmt-sid': patch
'@modplayjs/dsp-softmixer': patch
---

XR shell rewrite and audio fixes.

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
