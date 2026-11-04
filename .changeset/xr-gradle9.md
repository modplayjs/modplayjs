---
'@modplayjs/xr': patch
---

Move the XR build to the Gradle 9 wrapper that Meta's 0.15.0 samples ship.

Wrapper 8.14.6 -> 9.4.1, Kotlin 2.3.21 -> 2.4.21 (KGP 2.4.x supports Gradle
7.6.3-9.7.0 and AGP 8.5.2-9.3.1), foojay resolver-convention 0.9.0 -> 1.0.0.
AGP stays 8.13.2: it requires Gradle >= 8.13, so the pairing is supported, and
AGP 9.x would drag `compileSdk` 37 in with it.

`PathSensitivity` is now imported explicitly instead of relying on the implicit
`org.gradle.api.*` import, which the Gradle 9 Kotlin DSL no longer provides.
