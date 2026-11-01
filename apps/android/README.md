# modplayjs Android (V8)

Native Android 15+ player around the existing JS core.

## Requirements

- JDK 21
- Android SDK 37, build-tools 37.0.0, NDK 29.0.14206865, CMake 4.1.2
- Node 22
- Gradle 9.8.2 (wrapper included)


## Open in Android Studio

Open the **`apps/android`** folder directly: `File → Open → apps/android`.
Android Studio uses the Gradle wrapper (9.8.2) and the version catalog in
`gradle/libs.versions.toml`.

Included run configurations:

- **assembleDebug**
- **assembleRelease**

For a full V8 build, fetch the pinned prebuilt first. Without `v8Dir` the app
builds the stub JNI so the UI/library work can be developed.

## Build

```sh
npm ci
npm run build
npm run build:engine -w @modplayjs/android
cd apps/android
./gradlew :app:assembleDebug
```

V8 is a pinned prebuilt static library from NativeScript/v8-buildscripts
(V8 14.9.207.39, NDK r29). No depot_tools or Chromium checkout.

```sh
node apps/android/scripts/fetch-v8.mjs arm64-v8a
cd apps/android
./gradlew :app:assembleDebug \
  -Pv8Dir="$(node apps/android/scripts/fetch-v8.mjs arm64-v8a)"
```

Or simply:

```sh
./apps/android/scripts/build-local.sh
```

## CI

`.github/workflows/android.yml` fetches the pinned prebuilt V8, builds the
debug APK, and verifies 16 KB ELF segment alignment.

## What the app does

- Scans folders through the Storage Access Framework (persisted tree grants),
  indexing tracker modules, SID tunes and streamed audio into Room, with
  favourites, ignore list, search and filters.
- Plays through the JS core in V8: float32 stereo into an `AudioTrack`, a
  queue with repeat/shuffle/auto-advance, channel mute/solo, per-format accent
  colours and an AudioEffect panel entry.
- Media3 `MediaSessionService` owns the notification, lock-screen and media
  buttons.
- Diagnostics screen reports the engine, the audio path (buffer frames and
  time, framework minimum, play state, device burst, effects panel) and the
  capabilities the engine reports for the loaded track.
- UI in English and German, chosen in Settings → Language; the same list is
  declared in `res/xml/locales_config.xml` for Android's per-app language
  settings.

## Notes

- `minSdk 35` (Android 15), `compileSdk`/`targetSdk` 37 (Android 17), package
  `com.bitti06.modplayjs`, debug suffix `.debug`.
- Compose Material 3 Expressive (`MaterialExpressiveTheme`), Navigation 3 for
  the modal stack, Room 3 (`androidx.room3`) with destructive schema changes.
- No iOS/desktop support, no WASM, no prerender, no WebView. The UI is native
  Compose; the JS core runs headless in V8.
- `ViewSettings` still carries `patternView`, `artwork`, `follow` and
  `visualizer` flags; the Android UI does not surface them yet.
- Android 17 hardening: edge-to-edge with system bar icons following the in-app
  theme, `useLegacyPackaging = false` so `libmodplay_v8.so` is mapped read-only
  from the APK, and 16 KB page alignment for the native library.

## Source map

| path | contents |
|---|---|
| `MainActivity.kt`, `ModplayApp.kt`, `AppGraph.kt` | entry point, warm-up, process-wide singletons |
| `engine/` | `PlaybackSession` (queue, transport, snapshots), `V8Engine` JNI, `AudioTrackOutput`, `PcmRing`, settings store |
| `library/` | Room 3 entities/DAO, repository and SAF scanner |
| `media/` | Media3 session service and `SimpleBasePlayer` facade over the engine |
| `ui/` | Compose screens, navigation keys, theme, icons, `SupportedLocales` |
| `src/main/assets/engine/engine.js` | bundled JS core (built by `npm run build:engine`) |


## Windows

From the repository root:

```bat
apps\android\scripts\build-windows.cmd
```

Release build:

```bat
apps\android\scripts\build-windows.cmd -Task :app:assembleRelease
```

Stub build without V8:

```bat
apps\android\scripts\build-windows.cmd -SkipV8
```

The script verifies the pinned V8 SHA-256, builds the JS packages and engine
bundle, then runs `gradlew.bat` with `-Pv8Dir`.
