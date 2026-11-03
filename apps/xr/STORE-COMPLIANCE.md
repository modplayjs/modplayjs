# Meta Horizon Store — compliance check (first pass)

Checked against the project state of 2026-11-03. Items marked **manual** cannot
be verified from this repository.

## Platform requirements

| Requirement | Status | Evidence |
|---|---|---|
| `targetSdkVersion` 34 (new uploads, from 2026-03-01) | pass | `app/build.gradle.kts` → `targetSdk = 34` |
| Horizon OS is Android 14 / API 34 | pass | `minSdk = 34`, `compileSdk = 34` |
| Horizon OS SDK declaration | pass | `AndroidManifest.xml` → `horizonos:minSdkVersion 69`, `targetSdkVersion 81` |
| Quest 3 in supported devices | pass | `com.oculus.supportedDevices = quest3` |
| Launchable VR entry point | pass | `com.oculus.intent.category.VR` + `LAUNCHER` |
| 64-bit only | pass | `abiFilters += "arm64-v8a"` |
| 16 KB page alignment (native libs) | pass | `-Wl,-z,max-page-size=16384` in `CMakeLists.txt` |
| Native libs packaged uncompressed | pass (default) | AGP default for target 34 |

## Manifest and permissions

| Item | Status | Note |
|---|---|---|
| `USE_SCENE` / `USE_ANCHOR_API` declared | pass | required by MRUK |
| Runtime request for `USE_SCENE` | pass | `XrActivity.requestScenePermission()` |
| In-app rationale for scene data | pass | Settings panel states data stays on device |
| `INTERNET` | review | declared, currently unused; remove if no remote assets ship |
| `MODIFY_AUDIO_SETTINGS` | fixed | removed; app volume uses the engine master, not system routing |
| `HAND_TRACKING` | review | declared optional, no hand-specific UI yet |
| `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS` | fixed | removed, no service in this build |
| `allowBackup` | pass | `false` |
| Cleartext traffic | pass | not enabled; target 34 defaults to off |
| Launcher icon | fixed | adaptive icon added (`mipmap-anydpi-v26/ic_launcher`) |
| App label | pass | `modplay XR` |

## Signing and packaging

| Item | Status | Action |
|---|---|---|
| Release signing config | added | `keystore.properties` or `MODPLAY_XR_*` env vars; unsigned otherwise |
| Keystore + upload certificate | **manual** | create once, store offline, register with Meta |
| Version code/name | pass | `1` / `0.1.0` |
| Minification | off | acceptable; if enabled, keep the JNI names (`-keep class com.bitti06.modplayjs.engine.**`) |
| Third-party notices | **manual** | include V8 BSD notice + Meta Spatial SDK license in the store listing or an in-app screen |

## Store listing (all manual)

- 512×512 PNG icon (the adaptive vector is not accepted as a store asset)
- 2–5 landscape screenshots (Quest capture), optional trailer
- Privacy policy URL; data-safety form: no analytics, no accounts, scene data
  processed locally
- IARC content rating, age gate per Meta policy
- Support contact, category (Music / Media), price and release channels
- **Virtual Reality Check (VRC)** run on a signed release build; not available
  in this environment

## Behavioural requirements to test on device

- Holds 72 Hz with 8 audio objects and three panels (no frame-time spikes)
- Permission prompt appears once, denial keeps the app usable (stereo, 1 m ring)
- No audio after `onPause`; `onDestroy` releases every `AudioTrack`
- No crash without a stored scene (fresh account): MRUK load fails gracefully

## Known gaps before submission

1. SAF is in: tree picker (persisted), multi-document picker, ignored URIs,
   favorites and recents. Bundled demo content for a fresh install is missing.
2. No foreground service: audio stops when the app loses focus. The listing
   must not promise background playback until that lands.
3. `INTERNET` and `HAND_TRACKING` are declared without a feature that needs
   them; remove or justify before the data-safety form. `MODIFY_AUDIO_SETTINGS`
   was removed — volume is the engine master, not system volume.
