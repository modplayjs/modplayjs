---
'@modplayjs/xr': patch
---

Drop a deprecated system and adopt the Meta VR OS SDK.

`GrabbableSystem` is deprecated in 0.15.0 in favour of IsdkSystem, and with
`VRFeature` running the Interaction SDK it was not even active, so its
`grabButtons` configuration is gone. Grabbing goes through the `Grabbable`
component, which ISDK consumes.

Hand tracking is now requested at runtime instead of being assumed: if the user
denies it the app keeps running on controllers (VRC.Quest.Security.2 requires
that graceful failure), and the grant result is read by permission name instead
of by index.

The app depends on `com.meta.metavr:metavr-os-jsdk:207` as `compileOnly` and
logs `metavr.os.Build.Version.getApiVersion()` with the permission result, so
the device log states which Horizon OS API level is really running.
