---
'@modplayjs/xr': patch
---

Hands and a readable pattern view.

Input now runs on the Interaction SDK (the VRFeature default) instead of the
controller-only system, so hands and controllers both produce pointer events:
poke, ray and pinch on panels, with the panel touch-limiting that comes with it.
AvatarSystem hides the hands and controllers when the app loses input focus and
shows them again on regain; IsdkSystem pauses with them. Grab stays on the
squeeze buttons (VRC.Quest.Input.2).

The pattern panel is rebuilt on the phone app's model: per-field colours
(note, instrument, volume, effect), grid lines at channel boundaries, the
playhead highlighted and kept a few rows below the window edge, and a memoised
AnnotatedString per cell so scrolling 64 rows x 32 channels does not rebuild
two thousand styled strings per frame. Follow-scrolling only jumps when the
playhead leaves the visible window.
