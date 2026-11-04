---
'@modplayjs/xr': patch
---

Sweep the XR build up to the newest toolchain and SDK line that actually work
together.

Checked against the source of truth rather than guessed: Maven Central latests,
each AAR's `aar-metadata.properties` for `minCompileSdk`/`minAndroidGradlePluginVersion`,
the AGP release notes' compatibility tables, and Kotlin's KGP compatibility
table.

- `compileSdk` 36 -> 37, because core-ktx 1.19, lifecycle 2.11 and Compose UI
  1.12 all declare `minCompileSdk=37`. `minSdk`/`targetSdk` stay 34.
- core-ktx 1.19.1, lifecycle 2.11.0, Compose BOM 2026.09.00 (UI 1.12.1,
  Material3 1.4.0).
- AGP 9.5.0 -> **9.3.1**, deliberately *down*: KGP 2.4.21 supports AGP only up
  to 9.3.1, so 9.5 was outside the supported range. AGP 9.3 still supports API
  37.
- Gradle wrapper 9.6.0 -> 9.5.0, the minimum AGP 9.3 requires.
- Spatial SDK stays 0.15.0 (the newest, 29 Oct 2026); Meta VR OS SDK stays 207.
- The transparent details panel now uses `AlphaMode.HOLE_PUNCH` with
  `SceneMaterial.HOLE_PUNCH_PANEL_SHADER`, which is what Meta's layer page
  prescribes for transparent layer panels.
- `Scene.setPanelControllerScrollFactor(1.6f)` so a 32-channel pattern can be
  crossed with the thumbstick in reasonable time.
- The pulled `gradle.properties` compatibility switches are documented in
  place, each with the reason it exists.
