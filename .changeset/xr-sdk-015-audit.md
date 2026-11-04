---
'@modplayjs/xr': patch
---

Spatial SDK 0.15.0 audit.

The XR app already tracked 0.15.0 (the newest release, 29 Oct 2026) in both the
version catalog and the Gradle plugin pin, so no dependency bump was needed.
Instead the 0.15.0 breaking changes were checked against the code:

- Hierarchy scale is now the default: the app has no scaled parents, and the
  marker/collider scales are local, so nothing renders differently.
- Physics moved from Bullet to Jolt: the app registers no PhysicsFeature.
- Removed APIs (`toolkit.Color3/Color4`, `IsdkFeature`, `Query.with`,
  `PanelSceneObject.getTexture()` and friends, `MRUKPlane.size()`,
  `IsdkSystem.enableDebugTools()`, scene XML inflation): none are used.
- `onRecenter` now collapses repeated callbacks, which 0.15 can deliver more
  than once with a stale head pose.

The manifest moved from `uses-horizonos-sdk` to the current `uses-metavr-sdk`
element (same levels: min 69, target 81).
