# modplay XR

Quest 3 app: Meta Spatial SDK panels in front of the listener, one audio object
per tracker channel. Same feature set as `apps/android`, different shell.

This directory only holds the XR-specific code. The player engine, the V8 native
layer and the settings model are shared with the phone app:

- `engine.js` — bundled from `apps/android/engine/src/engine-entry.ts`
- `v8_jni.cpp` + `build/v8-prebuilt/android-arm64-v8a` — the V8 embedding
- `com.bitti06.modplayjs.engine.{V8Engine,EngineTypes,SettingsStore}` Kotlin —
  the JNI symbol names (`Java_com_bitti06_modplayjs_engine_V8Engine_*`) have to
  match, so the class and package cannot move. `V8Engine` carries the
  XR-only `renderSpatial()`; `PcmRing` is deliberately not copied, the XR
  player writes `AudioTrack` directly.

## Build

```bash
./gradlew :app:assembleDebug   # APK: app/build/outputs/apk/debug/app-debug.apk
./gradlew :app:lintDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

`preBuild` runs `:app:buildEngine` (npm + esbuild) automatically, so the APK
never carries a stale `engine.js`. Manual run: `./gradlew :app:buildEngine`.
If npm is not on `PATH` the task is skipped with a warning and the existing
bundle is kept.

`:app:fetchV8` downloads the pinned arm64 V8 prebuilt
(`apps/android/scripts/fetch-v8.mjs`) when `libv8_monolith.a` is missing;
`preBuild` depends on `:app:checkV8Prebuilt`, which triggers that fetch and then
fails for release tasks (warns for debug) if the library still is not there.
A build that fetched V8 in the same run still links the stub — run it once more.

`local.properties` must point at the Android SDK. `compileSdk` is 36
(platform 36 must be installed), `minSdk` and `targetSdk` stay 34: the Horizon
Store requires immersive apps to target 32-34. The Horizon OS level is declared
with the current
`uses-metavr-sdk` element (`minSdkVersion` 69, `targetSdkVersion` 81) instead
of the older `uses-horizonos-sdk`; both are accepted by the Store.

Dependency versions are the newest ones that still work with AGP 8.13.2 and
`compileSdk` 36, not simply the newest published: `core-ktx` 1.19 and
`lifecycle` 2.11 need `compileSdk` 37 plus AGP 9.1, and Compose 1.12 needs the
same. The ceiling is therefore:

| Artifact | Version | Why not newer |
|---|---|---|
| Kotlin | 2.4.21 | newest; KGP 2.4.x supports Gradle up to 9.7 and AGP up to 9.3.1 |
| Compose BOM | 2026.06.01 (Compose UI 1.11.4) | 2026.08.00+ ships UI 1.12, needs `compileSdk` 37 |
| core-ktx | 1.18.0 | 1.19.x needs `compileSdk` 37 + AGP 9.1 |
| activity-compose | 1.13.0 | newest; `minCompileSdk` 36 |
| lifecycle | 2.10.0 | 2.11.0 needs `compileSdk` 37 |
| coroutines | 1.11.0 | newest |
| serialization | 1.12.0 | newest |
| AGP / Gradle | 8.13.2 / 9.4.1 | AGP 9.x is a breaking major and needs `compileSdk` 37 |

The wrapper is on **Gradle 9.4.1**, which is what Meta ships with the 0.15.0
samples. AGP 8.13.2 needs Gradle >= 8.13, so 9.4.1 is fine; the reverse pairing
(old AGP on the Gradle 9 wrapper) is what fails during native/CMake model sync.

Spatial SDK is on the newest release line, `0.15.0` (`libs.versions.toml`,
`spatialsdk`). It is a breaking release: hierarchy scale is now the default and
physics moved from Bullet to Jolt. This app has no scaled parents and no
physics feature, so neither applies; keep it that way, or read the 0.15.0
release notes before adding `Scale` to a parent entity.

The Meta spatial plugin is applied from an explicit `buildscript` classpath
instead of the `plugins {}` DSL, so its `kotlin-compiler-embeddable` can be
excluded — otherwise Kotlin 2.2 warns about a second compiler on the build
classpath. The plugin version is pinned there (`spatial-gradle-plugin-impl`),
keep it in sync with `libs.versions.toml`.

### Host architecture

JDK, Gradle, Node and esbuild run as native arm64. Two Google components exist
only as x86_64 Linux binaries and therefore run under `qemu-x86_64` on an arm64
host:

- `aapt2` (AGP dependency)
- the NDK host toolchain (`toolchains/llvm/prebuilt/linux-x86_64`)

That needs the amd64 runtime libs (`libc6:amd64`, `libstdc++6:amd64`,
`zlib1g:amd64`), already installed here. CMake and Ninja from the SDK are also
x86_64; the system `cmake`/`ninja` are arm64 if you want to point AGP at them.

## Deprecations checked (Spatial SDK 0.15.0)

Nothing on the removal list in `apps/xr/app/src/main/java`:

| Removed in 0.15.0 | Status here |
|---|---|
| `com.meta.spatial.runtime.ScenePhysicsObject` | not used (no `PhysicsFeature`) |
| `com.meta.spatial.toolkit.Color3` / `Color4` | `Color4` comes from `core` |
| `Audio(String, …)` | not used |
| `IsdkFeature` | not used; `VRFeature` sets up ISDK |
| `Query.with` / `Query.registerEventListener` | not used |
| `PanelSceneObject.getTexture()/getLayer()/…` | not used |
| `MRUKPlane.size()` | we call `roomBounds.size()`, a different type |
| `IsdkSystem.enableDebugTools()` | not used |

Deprecated but still present, and removed from this app:

- `GrabbableSystem` — the 0.15.0 reference marks it `@Deprecated`, "replaced by
  IsdkSystem ... change the `inputSystemType` argument on `VrFeature`". We run
  the Interaction SDK, so the system is neither active nor configured any more;
  grabbing goes through the `Grabbable` component, which ISDK consumes.
- `TickTransformSystem.applyScale` / `ScaleSystem` (pose-only scale) — not used;
  the app has no scaled parents, so 0.15's hierarchy-scale default is fine.

## Horizon OS version

`uses-metavr-sdk` declares min 69 / target 81. The Meta VR OS SDK line is at
**207** (`com.meta.metavr:metavr-os-jsdk:207`), and Meta's own "add Spatial SDK
to an app" tutorial declares `minSdkVersion="207"` / `targetSdkVersion="207"`.
Raising target to 207 changes OS behaviour, so it is a deliberate step after a
device test rather than a version-number bump; 81 keeps the behaviour the app
was tested against.

The app depends on `com.meta.metavr:metavr-os-jsdk:207` as `compileOnly` (the
AAR is API stubs; Horizon OS supplies the implementation), and logs the runtime
API level on the permission result line:

```kotlin
metavr.os.Build.Version.getApiVersion()   // 207 on the current OS line
```

That is the value to branch on if a 207-only behaviour is ever added, rather
than raising `targetSdkVersion` blindly.

## Audio path

- stereo mode: one interleaved `AudioTrack`
- spatial mode: one mono `AudioTrack` per tracker channel, each with its own
  session registered via `SpatialAudioFeature.registerAudioSessionId`, and an
  entity at the channel's azimuth. The platform HRTF does panning and head
  tracking; the engine only supplies the stems and the angle.

Azimuth source, in `engine-entry.ts`:

| file layout | ch0 | ch1 | ch2 | ch3 |
|---|---|---|---|---|
| `lrlr` | -45° | +45° | -15° | +15° |
| `lrrl` | -45° | +45° | +15° | -15° |
| `panned` | pan × 60° × panSeparation/100 | … | … | … |

Channels ≥ 5 use their module pan. Layout is switchable at runtime in the
Settings panel; unknown layouts fall back to `panned`.

## Loading modules

Two pickers, both persisted (`takePersistableUriPermission`):

- **Ordner** — `ACTION_OPEN_DOCUMENT_TREE`, walks the tree recursively with
  `DocumentFile` (depth 12), shows the folder and its file count, `×` removes
  and releases the grant.
- **Dateien** — `ACTION_OPEN_DOCUMENT`, multiple documents.

Long-press a row ignores that URI; *Ignorierte löschen* resets the list. Folder
names in the list show where a module came from (`adb`, `picked`, or the tree).

Or push a folder:

```bash
adb push testfiles/ "/sdcard/Android/data/com.bitti06.modplayjs.xr/files/modules/"
```

The Library panel scans that folder (plus `files/modules`) on start and on
*Rescan*. Supported extensions are in `library/Library.kt`.

## What is not in this base

- indexed folders (the phone app scans whole trees; XR takes single documents)
- foreground media service, notification, media session
- favorites, recents, Room-backed index
- MRUK room geometry, occlusion, reflections (next step: P4)

## Localisation

All panel text comes from `res/values/strings.xml` (English) and
`res/values-de/strings.xml`. Settings › Sprache sets the per-app locale with
`LocaleManager`; the activity recreates and the panels re-register.

## Panel layout

Six panels hang on a fixed arc (Now Playing, Library, Settings, Pattern,
Details, Debug). Settings › **Frei anordnen** switches to free placement: every
panel gets a `Grabbable(PIVOT_Y, 0.6–2.4 m)` and can be grabbed with controller
or hand. On `onPause` the poses are written to `SharedPreferences("xr.layout")`;
the next start restores them. *Layout zurücksetzen* returns to the arc and
drops the saved poses.

## Debug view

Settings › **Quellen** toggles the source debug view:

- one unlit sphere per audio object, placed at the channel's azimuth, coloured
  with the channel palette, scaled by its live peak level;
- the Debug panel (bottom right) lists `CH nn`, the azimuth the engine computed
  and the same colour chip, so a sphere in the room maps 1:1 to a channel.

Colours come from `XrPlayer.colorArgb()`, so panel and markers cannot drift.

## Logging

`adb logcat -s modplay-xr` — output mode, object count, layout and engine
errors land there.
