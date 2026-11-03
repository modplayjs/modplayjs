# modplay XR

Quest 3 app: Meta Spatial SDK panels in front of the listener, one audio object
per tracker channel. Same feature set as `apps/android`, different shell.

This directory only holds the XR-specific code. The player engine, the V8 native
layer and the settings model are shared with the phone app:

- `engine.js` — bundled from `apps/android/engine/src/engine-entry.ts`
- `v8_jni.cpp` + `build/v8-prebuilt/android-arm64-v8a` — the V8 embedding
- `com.bitti06.modplayjs.engine.*` Kotlin — copied verbatim so the JNI symbol
  names (`Java_com_bitti06_modplayjs_engine_V8Engine_*`) link unchanged

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

`local.properties` must point at the Android SDK; `compileSdk` is 34,
`minSdk` is 34, Horizon OS manifest level 69 (target 81).

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
