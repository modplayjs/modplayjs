---
'@modplayjs/xr': patch
---

XR store-readiness fixes for the Horizon Store VRCs.

- Passthrough launch follows the system recommendation when the app is started
  from MR Home (`scene.isSystemPassthroughEnabled()`), and the user's own toggle
  wins from the second launch on (VRC.Quest.Functional.14).
- `onRecenter` re-authors the fixed panel arc in front of the new forward
  direction, so a manual recenter is respected (VRC.Quest.Functional.9).
- Playback pauses when the headset is taken off and resumes when it is worn
  again (VRC.Quest.Functional.2).
- Manifest: `android:version="1"` on the headtracking feature,
  `installLocation="auto"`, `excludeFromRecents="true"` (was `false`), drop the
  unused INTERNET permission (VRC.Quest.Packaging.1 / VRC.Quest.Security.2).
