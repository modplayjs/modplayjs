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
./apps/android/scripts/fetch-v8-prebuilt.sh arm64-v8a build/v8-prebuilt
cd apps/android
./gradlew :app:assembleDebug \
  -Pv8Dir="$PWD/../../build/v8-prebuilt/android-arm64-v8a"
```

Or simply:

```sh
./apps/android/scripts/build-local.sh
```

## CI

`.github/workflows/android.yml` fetches the pinned prebuilt V8, builds the
debug APK, and verifies 16 KB ELF segment alignment.

## Notes

- `minSdk 35`, `targetSdk 36`, package `com.bitti06.modplayjs`, debug suffix `.debug`.
- No iOS/desktop support.
- No WASM, no prerender, no WebView.
- Pattern view and visualization are hidden in this stage.
