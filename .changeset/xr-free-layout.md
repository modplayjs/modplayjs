---
'@modplayjs/xr': patch
---

Make free placement actually free, and stationary mode actually stationary.

Three bugs: `attachGrabbable` always set the component, so stationary panels
still moved in the hand; `apply()` rewrote every panel's Transform on every
track change, yanking a grabbed panel back into the arc; and free mode lost the
arrangement because the pose was only saved on pause and input-focus loss.

Now stationary removes the `Grabbable` component (the Interaction SDK turns it
into a grabbable interactable, so leaving it on is not enough), free mode leaves
an already-placed panel untouched on a track change, and switching to stationary
saves the arrangement first so switching back restores it. Poses are also saved
in `onSpatialShutdown`, which is guaranteed to run before the activity dies.

The settings row explains both modes instead of showing a bare toggle.
