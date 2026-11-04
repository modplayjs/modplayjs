---
'@modplayjs/xr': patch
---

Formal Meta Horizon Store compliance pass, with four defects fixed.

- `uses-metavr-sdk` went from min 69 / target 81 to **207 / 207**, the Meta VR OS
  SDK the app is compiled against and the pair Spatial SDK 0.15's own manifest
  template declares. 69 was the hybrid-app floor and claimed OS levels this
  build does not target. No `horizonos:uses-horizonos-sdk` alongside it.
- Hand tracking declarations removed (`horizonos.permission.HAND_TRACKING`,
  `oculus.software.handtracking`, `com.oculus.handtracking.version`) together
  with the runtime prompt. Input runs `VRFeature(..., SIMPLE_CONTROLLER)` and
  panels are grabbed with the controller grip, so hands cannot drive the app;
  VRC.Quest.Tracking.2 and Meta's app-compatibility page both forbid advertising
  an input modality that does not reach every interaction.
- VRC.Quest.Functional.2: `onPause` now pauses playback and `onResume` resumes
  it. Only `onHMDUnmounted` paused before, so entering passthrough from Quick
  Settings left the music running.
- VRC.Quest.Input.4: the legacy `InputSystem` is switched off on focus loss.
  `IsdkSystem.active` was cleared, but with SIMPLE_CONTROLLER that system is not
  registered, so controller input was never actually ignored.

Also added: `network_security_config.xml` (closed, no cleartext, no user CAs),
`com.oculus.ossplash.background="passthrough-contextual"` for the MR launch path,
the landscape/black-theme activity attributes from Meta's manifest template,
`setPreferredDisplayRate(72f)`, a `proguard-rules.pro` naming the V8 JNI and
Spatial SDK reflection, and an in-panel statement of the scene-permission
outcome so a denial reads as a limited feature.

`STORE-COMPLIANCE.md` is rewritten as a requirement-by-requirement audit with
the page and `last_updated` each line is checked against, plus the ranked list of
remaining gaps (entitlement check, text size, demo content, menu-button shortcut,
snap-turn) and what can only be verified on a device.
