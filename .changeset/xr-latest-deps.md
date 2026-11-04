---
'@modplayjs/xr': patch
---

Bring the XR app to the newest dependency line that AGP 8.13.2 can build.

Kotlin 2.3.21, Compose BOM 2026.06.01 (Compose UI 1.11.4 / Material3 1.4.0),
core-ktx 1.18.0, activity-compose 1.13.0, lifecycle 2.10.0, coroutines 1.11.0,
serialization 1.12.0, documentfile 1.1.0, and `compileSdk` 36.

`compileSdk` has to move because core-ktx 1.18 and activity-compose 1.13
declare `minCompileSdk=36`. `targetSdk` stays 34: the Horizon Store requires
immersive apps to target 32-34, and `minSdk` stays 34.

Not everything can go to its absolute newest yet: core-ktx 1.19, lifecycle
2.11, Compose 1.12 and therefore Compose BOM 2026.08.00+ all need
`compileSdk` 37 and AGP 9.1, and AGP 9.x is a breaking major. Spatial SDK stays
at 0.15.0, which is already the newest release.
